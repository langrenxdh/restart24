import { useEffect } from 'react'
import type { DayRecord } from '../lib/types'
import { sanitizeProofUrl } from '../lib/url'
import { dateLabel } from '../lib/dates'
import { GhostButton, Screen } from './ui'

/** 赢的时刻：庆祝首个交付物；失控日为灰色胜利变体；赢后可继续做事追加成果 */
export default function WinMoment({
  day,
  chain,
  onContinue,
  onStartEvening,
}: {
  day: DayRecord
  chain: number
  onContinue?: () => void
  onStartEvening?: () => void
}) {
  const first = day.deliverables[0]
  const emergency = first?.emergency === true
  const extra = day.deliverables.length - 1

  // 胜利振动：一天一次的事件配一次触觉高峰
  useEffect(() => {
    navigator.vibrate?.([30, 50, 30])
  }, [])

  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1
          className={`mt-6 font-display text-6xl font-bold animate-[win-in_320ms_var(--ease-spring)] ${
            emergency ? 'text-ink-soft' : 'text-ember'
          }`}
        >
          {emergency ? '今天守住了。' : '我赢了。'}
        </h1>
        <div className="relative mt-8 w-full max-w-xs animate-[fade-in_320ms_var(--ease-out)_80ms_backwards]">
          <div className="rounded-2xl bg-paper-deep px-5 py-4">
            <p className="whitespace-pre-wrap text-left text-[15px] leading-relaxed">{first?.text}</p>
            {sanitizeProofUrl(first?.proofUrl) && (
              <a
                href={sanitizeProofUrl(first?.proofUrl)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block truncate text-left text-sm text-ember-deep underline underline-offset-4"
              >
                {sanitizeProofUrl(first?.proofUrl)}
              </a>
            )}
          </div>
          {/* 朱砂印：赢/守 落印在成果卡右下角 */}
          <span
            aria-hidden
            className={`absolute -bottom-3 -right-2 grid h-12 w-12 rotate-[-4deg] place-items-center rounded-md font-display text-2xl font-bold text-paper shadow-sm animate-[stamp_180ms_260ms_var(--ease-out)_backwards] ${
              emergency ? 'bg-ink-soft' : 'bg-ember'
            }`}
          >
            {emergency ? '守' : '赢'}
          </span>
        </div>
        {extra > 0 && <p className="mt-4 text-sm text-ink-soft">今天另有 {extra} 个追加成果</p>}
        {chain > 0 && (
          <p className="mt-6 text-sm text-ink-soft">
            {emergency ? `灰色胜利 · 连续第 ${chain} 天` : `连续第 ${chain} 天有交付物`}
          </p>
        )}
        <p className="mt-1.5 text-xs text-ink-soft/70">{dateLabel(day.date)}</p>
        <p className="mt-12 text-sm leading-relaxed text-ink-soft">
          今天的胜利已经锁定。
          <br />
          继续做，算复利；就此停，是纪律。
        </p>
        {(onContinue || onStartEvening) && (
          <div className="mt-8 w-full max-w-xs space-y-3">
            {onContinue && <GhostButton onClick={onContinue}>继续做事，追加成果</GhostButton>}
            {onStartEvening && <GhostButton onClick={onStartEvening}>睡前 45 分钟 · 复盘 + 排好明天</GhostButton>}
          </div>
        )}
      </div>
    </Screen>
  )
}
