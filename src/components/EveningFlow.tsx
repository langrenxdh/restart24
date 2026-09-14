import { useEffect, useRef, useState } from 'react'
import type { DayRecord, Rule } from '../lib/types'
import {
  appendDeliverable,
  completeTask,
  deleteTask,
  findOrCreateOpenTask,
  getRecentRules,
  updateDay,
  upsertRuleByText,
} from '../db'
import { DEFAULT_ANCHOR_START } from '../config'
import { sanitizeProofUrl } from '../lib/url'
import { DELIVERABLE_TEMPLATES } from '../copy'
import { Chip, GhostButton, PrimaryButton, Screen } from './ui'

const textareaCls =
  'w-full resize-none rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-ink-soft/50 focus:border-ember/50'
const inputCls =
  'w-full rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] outline-none placeholder:text-ink-soft/50 focus:border-ember/50'

/** 复盘 5 问（DESIGN.md §6.1）：逐屏滑动，全部可留空 */
const QUESTIONS = [
  {
    key: 'best',
    title: '今天最有效的动作是什么？',
    hint: '找出有效的环境和流程，而不是批评自己。',
    ph: '例如：把手机放客厅后，上午顺畅很多',
  },
  { key: 'blocker', title: '今天最大的阻力是什么？', hint: '', ph: '例如：下午两点开始刷手机' },
  { key: 'action', title: '阻力出现时，你做了什么？', hint: '如实写。这是数据，不是罪状。', ph: '' },
  { key: 'keep', title: '明天保留哪个动作？', hint: '', ph: '' },
  { key: 'drop', title: '明天删除哪个动作？', hint: '', ph: '' },
] as const
type ReviewKey = (typeof QUESTIONS)[number]['key']

/** 前夜清障清单（DESIGN.md §6.1 第 4 步） */
const CHECKLIST = [
  '桌面已清空',
  '文档已打开，停在光标的位置',
  '资料放进同一个文件夹',
  '计时器放在看得见的位置',
  '手机去客厅充电',
  '短视频已限制或卸载',
]

const STEP = {
  REVIEW_LAST: 4,
  TRIAGE: 5,
  DELIVERABLE: 6,
  TOMORROW: 7,
  CHECKLIST: 8,
  IF_THEN: 9,
  DONE: 10,
}

/**
 * 晚间复合流程：复盘 5 问 → 记录今日交付物 → 写明日第一项任务（锚点）
 * → 前夜清障 → 写一条 If-Then → 明天见。
 * 复盘和交付物即时落库，中途退出不丢前面的记录。
 */
export default function EveningFlow({
  day,
  onChanged,
  onExit,
}: {
  day: DayRecord
  onChanged: () => void
  onExit: () => void
}) {
  // 本流程复盘的是打开时那一天：跨午夜继续写也归那天的记录
  const dateRef = useRef(day.date)
  // 进度保持：中途退出/误点成果墙回来，从上次的步骤继续（评审 #16）
  const stepKey = `r24.evening.step.${day.date}`
  const [step, setStepState] = useState(() => {
    const n = Number(sessionStorage.getItem(stepKey))
    return Number.isFinite(n) && n > 0 && n <= STEP.DONE ? n : 0
  })
  const setStep = (n: number) => {
    setStepState(n)
    if (n === STEP.DONE) sessionStorage.removeItem(stepKey)
    else sessionStorage.setItem(stepKey, String(n))
  }
  const [review, setReview] = useState<Record<ReviewKey, string>>(
    day.review ?? { best: '', blocker: '', action: '', keep: '', drop: '' },
  )
  const [deliverableText, setDeliverableText] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [startTime, setStartTime] = useState(day.anchor?.startTime ?? DEFAULT_ANCHOR_START)
  const [nextStep, setNextStep] = useState(day.anchor?.nextStep ?? '')
  const [where, setWhere] = useState(day.anchor?.where ?? '')
  const [ifThen, setIfThen] = useState(day.anchor?.ifThen ?? '')
  const [checks, setChecks] = useState<boolean[]>(() => CHECKLIST.map(() => false))
  const [recentRules, setRecentRules] = useState<Rule[]>([])
  const [triage, setTriage] = useState<'ask' | 'incomplete'>('ask')

  useEffect(() => {
    void getRecentRules(5).then(setRecentRules)
  }, [])

  function nextFromReview() {
    void updateDay(dateRef.current, { review: { ...review } })
    setStep(
      step === STEP.REVIEW_LAST ? (day.mit.trim() ? STEP.TRIAGE : STEP.DELIVERABLE) : step + 1,
    )
  }

  // MIT 若不在任务池里，为其补建一条（同文案的未完成任务直接复用，防止重复入池）
  async function ensureTask(): Promise<void> {
    if (day.mitTaskId) return
    const t = await findOrCreateOpenTask(day.mit)
    await updateDay(dateRef.current, { mitTaskId: t.id })
    onChanged()
  }

  async function triageDone() {
    if (day.mitTaskId) await completeTask(day.mitTaskId)
    setStep(STEP.DELIVERABLE)
  }

  async function triageCarry() {
    await ensureTask()
    setNextStep(day.mit) // 顺延：预填明天的第一项任务
    setStep(STEP.DELIVERABLE)
  }

  async function triagePool() {
    await ensureTask()
    setStep(STEP.DELIVERABLE)
  }

  async function triageDrop() {
    if (day.mitTaskId) await deleteTask(day.mitTaskId)
    setStep(STEP.DELIVERABLE)
  }

  async function persistDeliverable() {
    await appendDeliverable(dateRef.current, {
      text: deliverableText.trim(),
      proofUrl: sanitizeProofUrl(proofUrl),
      loggedAt: Date.now(),
    })
    onChanged()
    setStep(STEP.TOMORROW)
  }

  async function finish() {
    await updateDay(dateRef.current, {
      anchor: { nextStep: nextStep.trim(), where: where.trim(), startTime: startTime || DEFAULT_ANCHOR_START, ifThen: ifThen.trim() || undefined },
      eveningDone: true,
    })
    await upsertRuleByText(ifThen)
    onChanged()
    setStep(STEP.DONE)
  }

  // ---------- 复盘 5 问 ----------
  if (step <= STEP.REVIEW_LAST) {
    const q = QUESTIONS[step]
    return (
      <Screen>
        <p className="text-sm text-ink-soft">晚间复盘 · {step + 1}/5</p>
        <h1 className="mt-6 font-display text-3xl leading-snug">{q.title}</h1>
        {q.hint && <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{q.hint}</p>}
        <textarea
          value={review[q.key]}
          onChange={(e) => setReview({ ...review, [q.key]: e.target.value } as Record<ReviewKey, string>)}
          rows={4}
          maxLength={300}
          placeholder={q.ph || '可以留空'}
          className={`mt-6 ${textareaCls}`}
        />
        <div className="mt-auto space-y-3 pb-4 pt-6">
          <PrimaryButton onClick={nextFromReview}>
            {step === STEP.REVIEW_LAST ? '记完，排明天' : '下一问'}
          </PrimaryButton>
          <GhostButton onClick={onExit}>先退出，稍后继续</GhostButton>
        </div>
      </Screen>
    )
  }

  // ---------- MIT 处置：完成 / 顺延 / 回池 / 放弃 ----------
  if (step === STEP.TRIAGE) {
    return (
      <Screen>
        <p className="text-sm text-ink-soft">今天的 MIT</p>
        <div className="mt-4 rounded-2xl bg-paper-deep px-4 py-3 text-[15px] leading-relaxed">{day.mit}</div>
        {triage === 'ask' ? (
          <>
            <h1 className="mt-6 font-display text-3xl leading-snug">完成了吗？</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">如实回答。这是数据，不是审判。</p>
            <div className="mt-auto space-y-3 pb-4 pt-6">
              <PrimaryButton onClick={() => void triageDone()}>完成了</PrimaryButton>
              <GhostButton onClick={() => setTriage('incomplete')}>还没完成</GhostButton>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-display text-3xl leading-snug">没完成也正常。</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
              一件事的进度不等于一天的失败。把它交给明天，或者放回池子——别让它无声烂掉。
            </p>
            <div className="mt-auto space-y-3 pb-4 pt-6">
              <PrimaryButton onClick={() => void triageCarry()}>顺延为明天的任务</PrimaryButton>
              <GhostButton onClick={() => void triagePool()}>放回任务池</GhostButton>
              <GhostButton onClick={() => void triageDrop()}>放弃这个任务</GhostButton>
            </div>
          </>
        )}
      </Screen>
    )
  }

  // ---------- 记录今日交付物 ----------
  if (step === STEP.DELIVERABLE) {
    if (day.deliverables.length > 0) {
      return (
        <Screen>
          <p className="text-sm text-ink-soft">今日成果</p>
          <h1 className="mt-6 font-display text-4xl leading-snug">今天已经赢过。</h1>
          <div className="mt-6 space-y-2">
            {day.deliverables.map((d, i) => (
              <div key={i} className="rounded-2xl bg-paper-deep px-5 py-3 text-[15px] leading-relaxed">
                {d.text}
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            还想追加？走完晚间流程，回主页随时可以补。
          </p>
          <div className="mt-auto pb-4 pt-6">
            <PrimaryButton onClick={() => setStep(STEP.TOMORROW)}>下一题：排明天</PrimaryButton>
          </div>
        </Screen>
      )
    }
    return (
      <Screen>
        <p className="text-sm text-ink-soft">今日成果</p>
        <h1 className="mt-6 font-display text-4xl leading-snug">今天做成了什么？</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          还来得及。砍成 10 分钟版本，做完就赢。
        </p>
        <textarea
          value={deliverableText}
          onChange={(e) => setDeliverableText(e.target.value)}
          rows={4}
          maxLength={200}
          placeholder="最小版本的可见成果…"
          className={`mt-5 ${textareaCls}`}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {DELIVERABLE_TEMPLATES.slice(0, 2).map((t) => (
            <Chip key={t} onClick={() => setDeliverableText(t)}>
              {t}
            </Chip>
          ))}
        </div>
        <input
          value={proofUrl}
          onChange={(e) => setProofUrl(e.target.value)}
          maxLength={500}
          placeholder="成果链接（https://…，可选）"
          className={`mt-3 ${inputCls}`}
        />
        <div className="mt-auto space-y-3 pb-4 pt-6">
          <PrimaryButton disabled={!deliverableText.trim()} onClick={() => void persistDeliverable()}>
            记下，今天赢了
          </PrimaryButton>
          <GhostButton onClick={() => setStep(STEP.TOMORROW)}>今天没了，直接排明天</GhostButton>
        </div>
      </Screen>
    )
  }

  // ---------- 明日第一项任务（锚点） ----------
  if (step === STEP.TOMORROW) {
    return (
      <Screen>
        <p className="text-sm text-ink-soft">前夜清障 · 1/3</p>
        <h1 className="mt-6 font-display text-3xl leading-snug">明天几点开始，做什么？</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          一个看得见的成果。自检：能截图、能提交、能被别人看到吗？
        </p>
        <div className="mt-5 flex items-center gap-3">
          <label className="shrink-0 text-sm text-ink-soft">明天</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={`tnum ${inputCls} max-w-[9rem]`}
          />
          <span className="shrink-0 text-sm text-ink-soft">开始</span>
        </div>
        <textarea
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="我要完成：一个看得见的成果"
          className={`mt-3 ${textareaCls}`}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {DELIVERABLE_TEMPLATES.map((t) => (
            <Chip key={t} onClick={() => setNextStep(t)}>
              {t}
            </Chip>
          ))}
        </div>
        <input
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          maxLength={100}
          placeholder="在哪做 / 文件在哪（可选）"
          className={`mt-3 ${inputCls}`}
        />
        <div className="mt-auto pb-4 pt-6">
          <PrimaryButton disabled={!nextStep.trim()} onClick={() => setStep(STEP.CHECKLIST)}>
            就它了
          </PrimaryButton>
        </div>
      </Screen>
    )
  }

  // ---------- 前夜清障清单 ----------
  if (step === STEP.CHECKLIST) {
    return (
      <Screen>
        <p className="text-sm text-ink-soft">前夜清障 · 2/3</p>
        <h1 className="mt-6 font-display text-3xl leading-snug">把明天提前摆好</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          坐下就能开始，不用做选择。物理隔离诱惑，别指望自控力。
        </p>
        <div className="mt-5 space-y-2">
          {CHECKLIST.map((item, i) => (
            <button
              key={item}
              type="button"
              onClick={() => setChecks(checks.map((c, j) => (j === i ? !c : c)))}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition ${
                checks[i]
                  ? 'border-ember/60 bg-ember/10 text-ink'
                  : 'border-ink/15 bg-white/50 text-ink-soft'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                  checks[i] ? 'border-ember bg-ember text-paper' : 'border-ink/25'
                }`}
              >
                {checks[i] ? '✓' : ''}
              </span>
              {item}
            </button>
          ))}
        </div>
        <div className="mt-auto pb-4 pt-6">
          <PrimaryButton onClick={() => setStep(STEP.IF_THEN)}>清障完成</PrimaryButton>
        </div>
      </Screen>
    )
  }

  // ---------- 写一条 If-Then ----------
  if (step === STEP.IF_THEN) {
    return (
      <Screen>
        <p className="text-sm text-ink-soft">前夜清障 · 3/3</p>
        <h1 className="mt-6 font-display text-3xl leading-snug">写一条 If-Then</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          提前替明早的你，把决策做掉。
        </p>
        <textarea
          value={ifThen}
          onChange={(e) => setIfThen(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="如果明早想拖延，我就先启动计时器，只做 5 分钟"
          className={`mt-5 ${textareaCls}`}
        />
        {recentRules.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {recentRules.map((r) => (
              <Chip key={r.id} onClick={() => setIfThen(r.text)}>
                {r.text}
              </Chip>
            ))}
          </div>
        )}
        <div className="mt-auto pb-4 pt-6">
          <PrimaryButton onClick={() => void finish()}>完成，明天见</PrimaryButton>
          <p className="mt-3 text-center text-sm text-ink-soft">可以留空</p>
        </div>
      </Screen>
    )
  }

  // ---------- 完成屏 ----------
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="font-display text-6xl font-bold text-ember">明天见。</h1>
        <div className="mt-10 w-full max-w-xs rounded-2xl bg-paper-deep px-5 py-4 text-left">
          <p className="text-sm text-ink-soft">明天 {startTime} 开始</p>
          <p className="mt-1 text-[15px] leading-relaxed">{nextStep}</p>
          {where.trim() && <p className="mt-2 text-sm text-ink-soft">在哪：{where}</p>}
          {ifThen.trim() && <p className="mt-2 text-sm text-ink-soft">如果卡住：{ifThen}</p>}
        </div>
        <p className="mt-10 text-sm leading-relaxed text-ink-soft">
          你已经把明天最难的部分做完了。
          <br />
          剩下的只有一件事：让系统跑起来。
        </p>
        <div className="mt-10 w-full">
          <PrimaryButton onClick={onExit}>回主页</PrimaryButton>
        </div>
      </div>
    </Screen>
  )
}
