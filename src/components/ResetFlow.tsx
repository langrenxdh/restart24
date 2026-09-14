import { useRef, useState } from 'react'
import type { DayRecord } from '../lib/types'
import { updateDay } from '../db'
import { DEFAULT_ANCHOR_START } from '../config'
import { GhostButton, PrimaryButton, Screen } from './ui'

const textareaCls =
  'w-full resize-none rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-ink-soft/50 focus:border-ember/50'
const inputCls =
  'w-full rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] outline-none placeholder:text-ink-soft/50 focus:border-ember/50'

/**
 * 午间复位（DESIGN.md §6.4）：三行复位卡 + 可选粗锚点。
 * 上午完成了什么（自动带入）/ 下午最重要的一件事 / 几点开始。
 */
export default function ResetFlow({
  day,
  onChanged,
  onExit,
}: {
  day: DayRecord
  onChanged: () => void
  onExit: () => void
}) {
  // 复位卡写回打开时那天的记录（跨午夜同理）
  const dateRef = useRef(day.date)
  const auto =
    day.deliverables[0]?.text ??
    [...day.focusSessions].reverse().find((s) => s.result === 'done' || s.result === 'downgraded')
      ?.commitment ??
    ''
  const [morningDid, setMorningDid] = useState(auto)
  const [afternoonOne, setAfternoonOne] = useState('')
  const [startAt, setStartAt] = useState('14:00')
  const [tomorrowHint, setTomorrowHint] = useState('')

  async function save() {
    await updateDay(dateRef.current, {
      resetCard: { morningDid: morningDid.trim(), afternoonOne: afternoonOne.trim(), startAt },
      ...(tomorrowHint.trim()
        ? {
            anchor: {
              nextStep: tomorrowHint.trim(),
              where: day.anchor?.where ?? '',
              startTime: day.anchor?.startTime ?? DEFAULT_ANCHOR_START,
              ifThen: day.anchor?.ifThen,
            },
          }
        : null),
    })
    onChanged()
    onExit()
  }

  return (
    <Screen>
      <p className="text-sm text-ink-soft">午间复位</p>
      <h1 className="mt-6 font-display text-3xl leading-snug">三行复位卡</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        轻运动 10 分钟、简单吃点，避免高糖高油。复位不是偷懒，是换挡。
      </p>
      <div className="mt-5 rounded-2xl bg-paper-deep px-4 py-3 text-sm leading-relaxed text-ink-soft">
        铁律：上午做什么，下午继续做什么。
      </div>

      <label className="mt-5 block text-sm text-ink-soft">1. 上午完成了什么？</label>
      <input value={morningDid} maxLength={100} onChange={(e) => setMorningDid(e.target.value)} className={`mt-2 ${inputCls}`} />

      <label className="mt-4 block text-sm text-ink-soft">2. 下午最重要的一件事？</label>
      <input
        value={afternoonOne}
        onChange={(e) => setAfternoonOne(e.target.value)}
        maxLength={100}
        placeholder="和上午同一方向"
        className={`mt-2 ${inputCls}`}
      />

      <label className="mt-4 block text-sm text-ink-soft">3. 几点开始？</label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="time"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className={`tnum ${inputCls} max-w-[9rem]`}
        />
        {['14:00', '14:30', '15:00'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setStartAt(t)}
            className="rounded-full border border-ink/15 bg-paper-deep px-3 py-1.5 text-sm text-ink-soft transition active:scale-95"
          >
            {t}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-sm text-ink-soft">明天从哪继续？（可选，晚上再细化）</label>
      <textarea
        value={tomorrowHint}
        onChange={(e) => setTomorrowHint(e.target.value)}
        rows={2}
        maxLength={100}
        placeholder="粗锚点：下一步 / 文件在哪"
        className={`mt-2 ${textareaCls}`}
      />

      <div className="mt-auto space-y-3 pb-4 pt-6">
        <PrimaryButton disabled={!afternoonOne.trim()} onClick={() => void save()}>
          复位完成，进入下午
        </PrimaryButton>
        <GhostButton onClick={onExit}>先退出</GhostButton>
      </div>
    </Screen>
  )
}
