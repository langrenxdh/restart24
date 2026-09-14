import { useEffect, useRef, useState } from 'react'
import { computeMode } from './mode'
import {
  appendDeliverable,
  computeChain,
  db,
  ensureSchema,
  getDay,
  shiftKey,
  todayKey,
  updateDay,
  type Anchor,
  type DayRecord,
} from './db'
import { notify } from './notify'
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
type Notice = 'evening' | 'lateNight' | null

/** 晚间流程入口开放时间（DESIGN.md §4.1 默认 20:30，实现取整点 20:00） */
function eveningWindowOpen(): boolean {
  return new Date().getHours() >= 20
}

export default function App() {
  const [day, setDay] = useState<DayRecord | null>(null)
  const [chain, setChain] = useState(0)
  const [view, setView] = useState<View>('now')
  const [prefill, setPrefill] = useState('')
  const [relay, setRelay] = useState<Anchor | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  // 赢后的两种状态：庆祝屏 / 继续做事（追加成果）
  const [wonView, setWonView] = useState<'celebrate' | 'work'>('celebrate')

  async function refresh(): Promise<DayRecord> {
    const key = todayKey()
    const d = await getDay(key)
    setDay(d)
    const all = await db.days.toArray()
    setChain(computeChain(all, key))
    // 接力：读昨夜的锚点，晨间 MIT 预填
    const yesterday = await db.days.get(shiftKey(key, -1))
    setRelay(yesterday?.anchor ?? null)
    return d
  }

  useEffect(() => {
    void (async () => {
      await ensureSchema() // 先把旧格式记录迁移掉，再做一切
      const d = await refresh()
      // 刷新/重启后恢复运行中的专注轮
      if (d.focusSessions.some((s) => s.result === 'running')) setView('focus')
    })()
  }, [])

  // 午夜翻转：自动进入新的一天
  useEffect(() => {
    let current = todayKey()
    const t = setInterval(() => {
      if (todayKey() !== current) {
        current = todayKey()
        setView('now')
        setPrefill('')
        void refresh()
      }
    }, 30_000)
    return () => clearInterval(t)
  }, [])

  // 应用内时间提醒：20 点晚间流程 / 22 点未交付兜底（页面通知尽力而为，iOS 靠系统闹钟）
  const noticedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    function check() {
      if (!day) return
      const h = new Date().getHours()
      let next: Exclude<Notice, null> | null = null
      if (h >= 22 && day.deliverables.length === 0) next = 'lateNight'
      else if (h >= 20 && !day.eveningDone) next = 'evening'
      if (next && !noticedRef.current.has(next)) {
        noticedRef.current.add(next)
        if (next === 'lateNight') {
          notify('还有时间做一个 10 分钟版本', '失控日应急 · 做完就是灰色胜利，链条不断。')
        } else {
          notify('睡前 45 分钟', '复盘 + 排好明天。现在写下，明早就不用想了。')
        }
      }
      setNotice(next)
    }
    check()
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [day])

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

  const mode = day ? computeMode(day) : null
  const dateShort = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date())

  const hour = new Date().getHours()
  const eveningOpen = !!day && !day.eveningDone && eveningWindowOpen()
  const startEvening = () => setView('evening')
  const won = !!day && day.deliverables.length > 0
  // 午间复位窗口（12:00–18:00，还没写过复位卡、还没赢）
  const resetOpen = !!day && !day.resetCard && !won && hour >= 12 && hour < 18
  // 22 点还没交付物：最后温柔一击，引导应急模式
  const lateNight = !!day && !won && hour >= 22

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
