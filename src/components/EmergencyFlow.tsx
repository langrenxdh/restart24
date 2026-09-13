import { useEffect, useState } from 'react'
import type { DayRecord, FocusSession } from '../db'
import { uid, updateDay } from '../db'
import { playChime } from '../chime'
import { Chip, GhostButton, PrimaryButton, Screen } from './ui'

const textareaCls =
  'w-full resize-none rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-ink-soft/50 focus:border-ember/50'
const inputCls =
  'w-full rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] outline-none placeholder:text-ink-soft/50 focus:border-ember/50'

const EMERGENCY_CHIPS = ['列出 3 个要点', '写 50 字开头', '修一个最小的 bug', '整理一处笔记']

type Phase = 'compress' | 'timer' | 'log' | 'anchor' | 'done'

function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 失控日应急（DESIGN.md §6.5）：三步——
 * 把任务压缩成 10 分钟版 → 只完成一个可见交付物（灰色胜利）→ 写明日锚点。
 * 记为 emergencyWon，链条不断。10 分钟计时同样基于时间戳。
 */
export default function EmergencyFlow({
  day,
  onChanged,
  onExit,
}: {
  day: DayRecord
  onChanged: () => void
  onExit: () => void
}) {
  const [phase, setPhase] = useState<Phase>('compress')
  const [task, setTask] = useState('')
  const [result, setResult] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [startTime, setStartTime] = useState(day.anchor?.startTime ?? '08:00')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [endAt, setEndAt] = useState(0)
  const [nowMs, setNowMs] = useState(Date.now())

  const remaining = Math.max(0, endAt - nowMs)

  useEffect(() => {
    if (phase !== 'timer') return
    setNowMs(Date.now())
    const t = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(t)
  }, [phase])

  function settledSessions(): FocusSession[] {
    return day.focusSessions.map((s) =>
      s.result === 'running' || s.id === sessionId
        ? { ...s, result: 'done' as const, endedAt: Date.now() }
        : s,
    )
  }

  async function finishSession() {
    if (!sessionId) return
    await updateDay(day.date, { focusSessions: settledSessions() })
    onChanged()
  }

  // 到点：钟声 + 收尾 + 进入记录
  useEffect(() => {
    if (phase === 'timer' && endAt > 0 && remaining <= 0) {
      playChime()
      navigator.vibrate?.(200)
      setResult(task)
      void finishSession()
      setPhase('log')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, remaining, endAt])

  // 标签页标题同步
  useEffect(() => {
    document.title = phase === 'timer' ? `${fmt(remaining)} · 应急 10 分钟` : '重启24'
    return () => {
      document.title = '重启24'
    }
  }, [phase, remaining])

  async function startTimer() {
    const s: FocusSession = {
      id: uid(),
      startedAt: Date.now(),
      minutes: 10,
      commitment: task.trim(),
      result: 'running',
    }
    setSessionId(s.id)
    setEndAt(s.startedAt + 10 * 60_000)
    setNowMs(Date.now())
    setPhase('timer')
    await updateDay(day.date, { focusSessions: [...day.focusSessions, s] })
    onChanged()
  }

  async function saveDeliverable() {
    await updateDay(day.date, {
      deliverable: {
        text: result.trim(),
        proofUrl: proofUrl.trim() || undefined,
        loggedAt: Date.now(),
        emergency: true,
      },
      focusSessions: settledSessions(),
    })
    onChanged()
    setPhase('anchor')
  }

  async function saveAnchor() {
    await updateDay(day.date, {
      anchor: {
        nextStep: nextStep.trim(),
        where: day.anchor?.where ?? '',
        startTime,
        ifThen: day.anchor?.ifThen,
      },
    })
    onChanged()
    setPhase('done')
  }

  // ---------- 1. 压缩任务 ----------
  if (phase === 'compress') {
    return (
      <Screen>
        <p className="text-sm text-ink-soft">失控日应急 · 1/3</p>
        <h1 className="mt-6 font-display text-3xl leading-snug">把任务砍到 10 分钟</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          一天被打乱很正常。真正毁掉持续性的不是中断，是中断后彻底放弃。
        </p>
        {day.mit && (
          <p className="mt-4 rounded-2xl bg-paper-deep px-4 py-3 text-sm leading-relaxed text-ink-soft">
            今天的 MIT：{day.mit}
          </p>
        )}
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={3}
          placeholder="10 分钟版是什么？"
          className={`mt-5 ${textareaCls}`}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {EMERGENCY_CHIPS.map((t) => (
            <Chip key={t} onClick={() => setTask(t)}>
              {t}
            </Chip>
          ))}
        </div>
        <div className="mt-auto space-y-3 pb-4 pt-6">
          <PrimaryButton disabled={!task.trim()} onClick={() => void startTimer()}>
            就这个 10 分钟版
          </PrimaryButton>
          <GhostButton onClick={onExit}>先退出</GhostButton>
        </div>
      </Screen>
    )
  }

  // ---------- 2. 10 分钟微交付 ----------
  if (phase === 'timer') {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="max-w-xs text-center text-sm leading-relaxed text-ink-soft">只做这一件：{task}</p>
          <p className="tnum mt-8 font-display text-[5.5rem] font-bold leading-none tracking-tight">
            {fmt(remaining)}
          </p>
          <p className="mt-8 text-sm text-ink-soft">做完就算赢。灰色胜利也是胜利。</p>
        </div>
        <div className="space-y-3 pb-4">
          <PrimaryButton
            onClick={() => {
              setResult(task)
              void finishSession()
              setPhase('log')
            }}
          >
            做完了
          </PrimaryButton>
          <GhostButton onClick={onExit}>先退出，回来接着算</GhostButton>
        </div>
      </Screen>
    )
  }

  // ---------- 3. 记录灰色胜利 ----------
  if (phase === 'log') {
    return (
      <Screen>
        <p className="text-sm text-ink-soft">失控日应急 · 2/3</p>
        <h1 className="mt-6 font-display text-3xl leading-snug">做成了什么？</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">哪怕很小，写下来。给大脑发信号。</p>
        <textarea
          value={result}
          onChange={(e) => setResult(e.target.value)}
          rows={4}
          placeholder="10 分钟做出的可见成果…"
          className={`mt-5 ${textareaCls}`}
        />
        <input
          value={proofUrl}
          onChange={(e) => setProofUrl(e.target.value)}
          placeholder="成果链接或文件位置（可选）"
          className={`mt-3 ${inputCls}`}
        />
        <div className="mt-auto pb-4 pt-6">
          <PrimaryButton disabled={!result.trim()} onClick={() => void saveDeliverable()}>
            记下，灰色胜利
          </PrimaryButton>
        </div>
      </Screen>
    )
  }

  // ---------- 4. 明日锚点 ----------
  if (phase === 'anchor') {
    return (
      <Screen>
        <p className="text-sm text-ink-soft">失控日应急 · 3/3</p>
        <h1 className="mt-6 font-display text-3xl leading-snug">明天从哪开始？</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          不追求今天翻盘，只保证明天能立刻接上。
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
          placeholder="下一步是什么？文件在哪？"
          className={`mt-3 ${textareaCls}`}
        />
        <div className="mt-auto pb-4 pt-6">
          <PrimaryButton disabled={!nextStep.trim()} onClick={() => void saveAnchor()}>
            完成，明天见
          </PrimaryButton>
        </div>
      </Screen>
    )
  }

  // ---------- 完成屏 ----------
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="font-display text-5xl font-bold text-ink-soft">今天守住了。</h1>
        <div className="mt-10 w-full max-w-xs rounded-2xl bg-paper-deep px-5 py-4 text-left">
          <p className="text-sm text-ink-soft">明天 {startTime} 开始</p>
          <p className="mt-1 text-[15px] leading-relaxed">{nextStep}</p>
        </div>
        <p className="mt-10 text-sm leading-relaxed text-ink-soft">
          灰色胜利也算胜利，链条没断。
          <br />
          中断不可怕，可怕的是中断后彻底放弃。
        </p>
        <div className="mt-10 w-full">
          <PrimaryButton onClick={onExit}>回主页</PrimaryButton>
        </div>
      </div>
    </Screen>
  )
}
