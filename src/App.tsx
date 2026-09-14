import { useEffect, useRef, useState } from 'react'
import { computeMode } from './lib/domain'
import { appendDeliverable, updateDay } from './db'
import { EVENING_OPEN_HOUR, LATE_NIGHT_HOUR, RESET_WINDOW } from './config'
import { useToday } from './hooks/useToday'
import { sanitizeProofUrl } from './lib/url'
import DeliverableLog from './components/DeliverableLog'
import EmergencyFlow from './components/EmergencyFlow'
import ErrorBoundary from './components/ErrorBoundary'
import EveningFlow from './components/EveningFlow'
import FocusFlow from './components/FocusFlow'
import InstallGuide from './components/InstallGuide'
import MorningRitual from './components/MorningRitual'
import ResetFlow from './components/ResetFlow'
import TodayCard from './components/TodayCard'
import WinMoment from './components/WinMoment'
import WinWall from './components/WinWall'

type View = 'now' | 'focus' | 'log' | 'evening' | 'reset' | 'emergency' | 'wall'

export default function App() {
  const { day, chain, relay, now, dayKey, notice, initError, retry, refresh } = useToday()
  const [view, setView] = useState<View>('now')
  const [prefill, setPrefill] = useState('')
  // 赢后的两种状态：庆祝屏 / 继续做事（追加成果）
  const [wonView, setWonView] = useState<'celebrate' | 'work'>('celebrate')

  // 刷新/重启后：今天的运行中会话回到对应界面（应急轮有 kind 标记）
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!day || restoredRef.current) return
    restoredRef.current = true
    const running = day.focusSessions.find((s) => s.result === 'running')
    if (running) setView(running.kind === 'emergency' ? 'emergency' : 'focus')
  }, [day])

  // 物理返回手势/浏览器返回：从任何子视图回到今天（PWA 借镜 HIG 的免费正确性）
  useEffect(() => {
    function onPop() {
      setView('now')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /** 进入子视图时压一条历史记录，让返回键可用 */
  function openView(v: View) {
    if (v !== 'now') {
      try {
        history.pushState({ r24: true }, '')
      } catch {
        /* 罕见环境忽略 */
      }
    }
    setView(v)
  }
  const wallToggle = () => openView(view === 'wall' ? 'now' : 'wall')

  // 午夜翻转：新的一天。专注/应急界面不强切——组件持有开轮日期，写回原日期；
  // 其余视图回到新一天的工作台。
  const lastViewKeyRef = useRef(dayKey)
  useEffect(() => {
    if (lastViewKeyRef.current === dayKey) return
    lastViewKeyRef.current = dayKey
    if (view !== 'focus' && view !== 'emergency') {
      setView('now')
      setPrefill('')
      setWonView('celebrate')
    }
  }, [dayKey, view])

  async function completeMorning(mit: string, mitTaskId?: string) {
    if (!day) return
    await updateDay(day.date, { mit, mitTaskId, morningDone: true })
    await refresh()
  }

  async function saveDeliverable(text: string, proofUrl: string) {
    if (!day) return
    await appendDeliverable(day.date, {
      text,
      proofUrl: sanitizeProofUrl(proofUrl),
      loggedAt: Date.now(),
    })
    await refresh()
    setView('now')
    setWonView('celebrate')
  }

  const mode = day ? computeMode(day, new Date(now)) : null
  const dateShort = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(now))

  const hour = new Date(now).getHours()
  const eveningOpen = !!day && !day.eveningDone && hour >= EVENING_OPEN_HOUR
  const startEvening = () => openView('evening')
  const won = !!day && day.deliverables.length > 0
  // 午间复位窗口（还没写过复位卡、还没赢）
  const resetOpen =
    !!day && !day.resetCard && !won && hour >= RESET_WINDOW.start && hour < RESET_WINDOW.end
  // 深夜还没交付物：最后温柔一击，引导应急模式
  const lateNight = !!day && !won && hour >= LATE_NIGHT_HOUR

  let body: React.ReactNode = null
  if (initError) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm leading-relaxed text-ink-soft">{initError}</p>
        <button
          type="button"
          onClick={() => void retry()}
          className="rounded-2xl bg-ember px-6 py-3 text-base font-semibold text-paper"
        >
          重试
        </button>
      </div>
    )
  } else if (!day || !mode) {
    body = <div className="flex flex-1 items-center justify-center text-sm text-ink-soft">…</div>
  } else if (view === 'focus') {
    // 运行中的专注轮优先于一切
    body = (
      <FocusFlow
        day={day}
        onChanged={() => void refresh()}
        onExit={() => setView('now')}
        onDeliver={(p) => {
          setPrefill(p)
          setView('log')
        }}
      />
    )
  } else if (view === 'emergency') {
    body = <EmergencyFlow day={day} onChanged={() => void refresh()} onExit={() => setView('now')} />
  } else if (view === 'reset') {
    body = <ResetFlow day={day} onChanged={() => void refresh()} onExit={() => setView('now')} />
  } else if (view === 'evening') {
    body = <EveningFlow day={day} onChanged={() => void refresh()} onExit={() => setView('now')} />
  } else if (view === 'log') {
    body = (
      <DeliverableLog
        day={day}
        initial={prefill}
        append={won}
        onSave={(text, proofUrl) => saveDeliverable(text, proofUrl)}
        onCancel={() => setView('now')}
      />
    )
  } else if (view === 'wall') {
    body = <WinWall chain={chain} onChanged={() => void refresh()} />
  } else if (mode === 'won') {
    body =
      wonView === 'celebrate' ? (
        <WinMoment
          day={day}
          chain={chain}
          onContinue={() => setWonView('work')}
          onStartEvening={eveningOpen ? startEvening : undefined}
        />
      ) : (
        <TodayCard
          day={day}
          won
          eveningProminent
          onStartFocus={() => openView('focus')}
          onLog={() => {
            setPrefill('')
            openView('log')
          }}
          onStartEvening={startEvening}
        />
      )
  } else if (mode === 'morning') {
    body = (
      <MorningRitual
        compressed={false}
        relay={relay}
        onComplete={(mit, taskId) => void completeMorning(mit, taskId)}
      />
    )
  } else if (mode === 'quick-start') {
    body = (
      <MorningRitual
        compressed
        relay={relay}
        onComplete={(mit, taskId) => void completeMorning(mit, taskId)}
      />
    )
  } else {
    const last = [...day.focusSessions].reverse().find((s) => s.result !== 'abandoned')
    body = (
      <TodayCard
        day={day}
        eveningProminent={eveningOpen || !!day.eveningDone}
        onStartFocus={() => openView('focus')}
        onLog={() => {
          setPrefill(last?.commitment ?? '')
          openView('log')
        }}
        onStartEvening={startEvening}
        onStartReset={resetOpen ? () => openView('reset') : undefined}
        onStartEmergency={() => openView('emergency')}
        lateNight={lateNight}
      />
    )
  }

  // 庆祝瞬间清场：赢的时刻不与任何卡片争夺注意力（双设计师共识）
  const celebrating = mode === 'won' && wonView === 'celebrate'
  // 深夜收束：TodayCard 已有应急卡时不再叠顶部横幅（西方 P1）
  const bannerVisible =
    view === 'now' && !!notice && !celebrating && !(notice === 'lateNight' && mode === 'focus')
  const guideVisible =
    view === 'now' && !celebrating && mode !== null && mode !== 'morning' && mode !== 'quick-start'
  // 暮色：晚间/深夜纸色沉档（东方 P4）
  const phase = hour >= 22 ? 'night' : hour >= 20 ? 'evening' : 'day'
  // 新用户价值主张（西方 P8：10 秒内说清这是什么）
  const showTagline =
    view === 'now' && chain === 0 && !!day && !day.morningDone && day.deliverables.length === 0

  return (
    <div
      data-phase={phase}
      className="mx-auto flex min-h-full max-w-[26rem] flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8"
    >
      <header className="mb-4 flex items-center justify-between text-xs tracking-widest text-ink-soft">
        <span>
          重启24
          {chain > 0 && <span className="ml-2 text-moss-deep">连胜 {chain}</span>}
        </span>
        <span className="flex items-center gap-4">
          {view !== 'wall' && <span>{dateShort}</span>}
          {view !== 'focus' && (
            <button
              type="button"
              onClick={wallToggle}
              className="-my-2 py-2 text-ember-deep underline-offset-4 active:underline"
            >
              {view === 'wall' ? '关闭' : '成果墙'}
            </button>
          )}
        </span>
      </header>
      {showTagline && (
        <p className="-mt-2 mb-4 text-center text-[11px] tracking-[0.2em] text-ink-soft/70">
          一天只做一件事 · 做出来才算赢
        </p>
      )}
      {bannerVisible && (
        <button
          type="button"
          onClick={() => openView(notice === 'lateNight' ? 'emergency' : 'evening')}
          className="mb-4 w-full rounded-2xl border border-ember/40 bg-ember/10 px-5 py-3 text-left text-sm text-ember-deep transition active:scale-[0.98]"
        >
          {notice === 'lateNight' ? '还有时间做一个 10 分钟版本 →' : '睡前 45 分钟：复盘 + 排好明天 →'}
        </button>
      )}
      {guideVisible && <InstallGuide />}
      <ErrorBoundary>
        <div key={view} className="flex flex-1 flex-col animate-[view-in_150ms_var(--ease-out)]">
          {body}
        </div>
      </ErrorBoundary>
    </div>
  )
}
