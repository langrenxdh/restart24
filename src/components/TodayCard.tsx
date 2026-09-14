import type { DayRecord } from '../lib/types'
import { GhostButton, PrimaryButton, Screen } from './ui'

const linkCls = '-my-1.5 py-1.5 text-[15px] text-ink-soft underline underline-offset-4'

/** 深度执行入口：今天的 MIT + 专注/记录交付 + 复位/应急入口。won = 赢后继续模式 */
export default function TodayCard({
  day,
  won = false,
  eveningProminent = false,
  onStartFocus,
  onLog,
  onStartEvening,
  onStartReset,
  onStartEmergency,
  lateNight,
}: {
  day: DayRecord
  won?: boolean
  /** 晚间入口的视觉层级：20 点后或需补充修改时升为按钮，白天保持文字链不抢焦点 */
  eveningProminent?: boolean
  onStartFocus: () => void
  onLog: () => void
  onStartEvening?: () => void
  onStartReset?: () => void
  onStartEmergency?: () => void
  lateNight?: boolean
}) {
  const finished = day.focusSessions.filter((s) => s.result === 'done' || s.result === 'downgraded')
  const minutes = finished.reduce((sum, s) => sum + s.minutes, 0)

  return (
    <Screen>
      {won && (
        <p className="text-sm text-moss-deep">
          今天已赢 · {day.deliverables.length} 个成果
        </p>
      )}
      <p className="text-sm tracking-wide text-ink-soft">唯一的 MIT</p>
      <h1 className="mt-4 font-display text-[2rem] leading-snug">{day.mit}</h1>
      {finished.length > 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          今天已完成 {finished.length} 轮专注 · {minutes} 分钟
        </p>
      )}

      {won && day.deliverables.length > 0 && (
        <div className="mt-4 space-y-1.5 rounded-2xl bg-paper-deep px-4 py-3 text-sm leading-relaxed">
          {day.deliverables.map((d, i) => (
            <p key={i} className="truncate">
              <span className="text-ink-soft">{i === 0 ? '🏆' : '＋'}</span> {d.text}
            </p>
          ))}
        </div>
      )}

      {day.resetCard && (
        <div className="mt-4 rounded-2xl bg-paper-deep px-4 py-3 text-sm leading-relaxed text-ink-soft">
          <p>
            下午 {day.resetCard.startAt} · {day.resetCard.afternoonOne}
          </p>
          <p className="mt-1">铁律：上午做什么，下午继续做什么。</p>
        </div>
      )}

      {!won && lateNight && onStartEmergency ? (
        <button
          type="button"
          onClick={onStartEmergency}
          className="mt-6 w-full rounded-2xl border border-ember/40 bg-ember/10 px-5 py-4 text-left transition active:scale-[0.98]"
        >
          <span className="block text-[15px] text-ember-deep">还有时间做一个 10 分钟版本。</span>
          <span className="mt-1 block text-sm leading-relaxed text-ink-soft">
            失控日应急 · 做完就是灰色胜利，链条不断。
          </span>
        </button>
      ) : (
        <p className="mt-6 max-w-xs text-sm leading-relaxed text-ink-soft">
          {won ? '胜利已锁定，现在做的都是复利。' : '先把东西做出来，再追求完美。做出来是起点，做好是终点。'}
        </p>
      )}

      <div className="mt-auto space-y-2.5 pb-4 pt-10">
        <PrimaryButton onClick={onStartFocus}>开始一轮专注</PrimaryButton>
        {!won && onStartReset && <GhostButton onClick={onStartReset}>午间复位 · 三行卡</GhostButton>}
        {won ? (
          <GhostButton onClick={onLog}>追加一个成果</GhostButton>
        ) : (
          <button type="button" onClick={onLog} className={linkCls}>
            直接记录交付物
          </button>
        )}
        {onStartEvening &&
          (eveningProminent ? (
            <GhostButton onClick={onStartEvening}>
              {day.eveningDone ? '晚间流程 · 补充修改' : '晚间流程 · 排好明天'}
            </GhostButton>
          ) : (
            <button type="button" onClick={onStartEvening} className={linkCls}>
              晚间流程 · 排好明天
            </button>
          ))}
        {!won && onStartEmergency && !lateNight && (
          <button
            type="button"
            onClick={onStartEmergency}
            className={`${linkCls} block w-full text-center`}
          >
            今天乱了
          </button>
        )}
      </div>
    </Screen>
  )
}
