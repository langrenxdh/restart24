import { useEffect, useRef, useState } from 'react'
import { computeMode } from './lib/domain'
import { appendDeliverable, updateDay } from './db'
import { EVENING_OPEN_HOUR, LATE_NIGHT_HOUR, RESET_WINDOW } from './config'
import { useToday } from './hooks/useToday'
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
  const { day, chain, relay, now, dayKey, notice, refresh } = useToday()
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
      proofUrl: proofUrl || undefined,
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
  const startEvening = () => setView('evening')
  const won = !!day && day.deliverables.length > 0
  // 午间复位窗口（还没写过复位卡、还没赢）
  const resetOpen =
    !!day && !day.resetCard && !won && hour >= RESET_WINDOW.start && hour < RESET_WINDOW.end
  // 深夜还没交付物：最后温柔一击，引导应急模式
  const lateNight = !!day && !won && hour >= LATE_NIGHT_HOUR

  let body: React.ReactNode = null
  if (!day || !mode) {
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
        onSave={(text, proofUrl) => void saveDeliverable(text, proofUrl)}
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
          onStartFocus={() => setView('focus')}
          onLog={() => {
            setPrefill('')
            setView('log')
          }}
          onStartEvening={eveningOpen ? startEvening : undefined}
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
        onStartFocus={() => setView('focus')}
        onLog={() => {
          setPrefill(last?.commitment ?? '')
          setView('log')
        }}
        onStartEvening={eveningOpen ? startEvening : undefined}
        onStartReset={resetOpen ? () => setView('reset') : undefined}
        onStartEmergency={() => setView('emergency')}
        lateNight={lateNight}
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[26rem] flex-col px-6 pb-8 pt-8">
      <header className="mb-4 flex items-center justify-between text-xs tracking-widest text-ink-soft">
        <span>
          重启24
          {chain > 0 && <span className="ml-2 text-moss">连胜 {chain}</span>}
        </span>
        <span className="flex items-center gap-4">
          {view !== 'wall' && <span>{dateShort}</span>}
          {view !== 'focus' && (
            <button
              type="button"
              onClick={() => setView(view === 'wall' ? 'now' : 'wall')}
              className="text-ember underline-offset-4 active:underline"
            >
              {view === 'wall' ? '关闭' : '成果墙'}
            </button>
          )}
        </span>
      </header>
      {view === 'now' && notice && (
        <button
          type="button"
          onClick={() => setView(notice === 'lateNight' ? 'emergency' : 'evening')}
          className="mb-4 w-full rounded-2xl border border-ember/40 bg-ember/10 px-5 py-3 text-left text-sm text-ember transition active:scale-[0.98]"
        >
          {notice === 'lateNight' ? '还有时间做一个 10 分钟版本 →' : '睡前 45 分钟：复盘 + 排好明天 →'}
        </button>
      )}
      {view === 'now' && <InstallGuide />}
      <ErrorBoundary>{body}</ErrorBoundary>
    </div>
  )
}
