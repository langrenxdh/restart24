import type { DayRecord } from '../db'
import { GhostButton, Screen } from './ui'

/** 赢的时刻：今天唯一的庆祝屏；失控日为灰色胜利变体；晚间可进入睡前流程 */
export default function WinMoment({
  day,
  chain,
  onStartEvening,
}: {
  day: DayRecord
  chain: number
  onStartEvening?: () => void
}) {
  const emergency = day.deliverable?.emergency === true
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className={`mt-6 font-display text-6xl font-bold ${emergency ? 'text-ink-soft' : 'text-ember'}`}>
          {emergency ? '今天守住了。' : '我赢了。'}
        </h1>
        <div className="mt-8 w-full max-w-xs rounded-2xl bg-paper-deep px-5 py-4">
          <p className="whitespace-pre-wrap text-left text-[15px] leading-relaxed">{day.deliverable?.text}</p>
          {day.deliverable?.proofUrl && (
            <a
              href={day.deliverable.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block truncate text-left text-sm text-ember underline underline-offset-4"
            >
              {day.deliverable.proofUrl}
            </a>
          )}
        </div>
        {chain > 0 && (
          <p className="mt-6 text-sm text-ink-soft">
            {emergency ? `灰色胜利 · 连续第 ${chain} 天` : `连续第 ${chain} 天有交付物`}
          </p>
        )}
        <p className="mt-12 text-sm leading-relaxed text-ink-soft">
          今天就到这。
          <br />
          休息也是系统的一部分。
        </p>
        {onStartEvening && (
          <div className="mt-8 w-full max-w-xs">
            <GhostButton onClick={onStartEvening}>睡前 45 分钟 · 复盘 + 排好明天</GhostButton>
          </div>
        )}
      </div>
    </Screen>
  )
}
