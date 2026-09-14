import type { DayRecord } from '../lib/types'
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
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className={`mt-6 font-display text-6xl font-bold ${emergency ? 'text-ink-soft' : 'text-ember'}`}>
          {emergency ? '今天守住了。' : '我赢了。'}
        </h1>
        <div className="mt-8 w-full max-w-xs rounded-2xl bg-paper-deep px-5 py-4">
          <p className="whitespace-pre-wrap text-left text-[15px] leading-relaxed">{first?.text}</p>
          {first?.proofUrl && (
            <a
              href={first.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block truncate text-left text-sm text-ember underline underline-offset-4"
            >
              {first.proofUrl}
            </a>
          )}
        </div>
        {extra > 0 && <p className="mt-4 text-sm text-ink-soft">今天另有 {extra} 个追加成果</p>}
        {chain > 0 && (
          <p className="mt-6 text-sm text-ink-soft">
            {emergency ? `灰色胜利 · 连续第 ${chain} 天` : `连续第 ${chain} 天有交付物`}
          </p>
        )}
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
