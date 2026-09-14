import { useEffect, useRef, useState } from 'react'
import type { DayRecord, FocusSession } from '../lib/types'
import { finalizeFocusSession, startFocusSession } from '../db'
import { FOCUS_LENGTHS } from '../config'
import { DELIVERABLE_TEMPLATES, DOWNGRADE_SUGGESTIONS } from '../copy'
import { playChime, warmChime } from '../chime'
import { notify } from '../notify'
import { Chip, GhostButton, PrimaryButton, Screen } from './ui'

type Phase = 'entry' | 'running' | 'ended'

function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 深度执行：交付承诺 → 计时 → 结束确认。
 * 铁律（DESIGN.md §6.3）：剩余时间用时间戳差值计算，与渲染帧率、后台节流无关；
 * 刷新页面可从 db 恢复运行中的专注轮。
 */
export default function FocusFlow({
  day,
  onChanged,
  onExit,
  onDeliver,
}: {
  day: DayRecord
  onChanged: () => void
  onExit: () => void
  onDeliver: (prefill: string) => void
}) {
  const restored = day.focusSessions.find((s) => s.result === 'running') ?? null
  // 本轮所属日期：开轮时锁定。跨午夜继续计时/写库都归这天的记录（午夜翻转不杀计时器）。
  const dateRef = useRef(day.date)
  const [phase, setPhase] = useState<Phase>(restored ? 'running' : 'entry')
  const [session, setSession] = useState<FocusSession | null>(restored)
  const sessionRef = useRef<FocusSession | null>(restored)
  sessionRef.current = session
  const [minutes, setMinutes] = useState<number>(FOCUS_LENGTHS[0])
  const [commitment, setCommitment] = useState(restored?.commitment ?? '')
  const [stuckOpen, setStuckOpen] = useState(false)
  // 降级标记跟随会话持久化：刷新后仍正确记为 downgraded（评审 #13）
  const [usedStuck, setUsedStuckState] = useState(
    () => !!restored && sessionStorage.getItem(`r24.stuck.${restored.id}`) === '1',
  )
  const setUsedStuck = (v: boolean) => {
    setUsedStuckState(v)
    const s = sessionRef.current
    if (s) {
      if (v) sessionStorage.setItem(`r24.stuck.${s.id}`, '1')
      else sessionStorage.removeItem(`r24.stuck.${s.id}`)
    }
  }
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now())

  const endAt = session ? session.startedAt + session.minutes * 60_000 : 0
  const remaining = Math.max(0, endAt - nowMs)

  // 计时心跳：只驱动渲染，不负责计时本身
  useEffect(() => {
    if (phase !== 'running' || !session) return
    setNowMs(Date.now())
    const t = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(t)
  }, [phase, session])

  // 到点收尾：钟声 + 振动 + 页面通知（后台时）+ 落库
  useEffect(() => {
    if (phase === 'running' && session && remaining <= 0) {
      void finalize(usedStuck ? 'downgraded' : 'done')
      if (Date.now() - endAt < 60_000) {
        playChime()
        navigator.vibrate?.(200)
        if (document.visibilityState !== 'visible') {
          notify('专注轮结束', `${session.minutes} 分钟到了——回来记下这一轮的成果。`)
        }
      }
      setPhase('ended')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session, remaining])

  // 标签页标题同步倒计时（切走也能瞄一眼）
  useEffect(() => {
    document.title = phase === 'running' ? `${fmt(remaining)} · 专注中` : '重启24'
    return () => {
      document.title = '重启24'
    }
  }, [phase, remaining])

  // 屏幕常亮（可选能力，失败静默）
  const lockRef = useRef<{ release?: () => Promise<void> } | null>(null)
  async function requestWakeLock() {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<never> } }).wakeLock
      lockRef.current = (await wl?.request('screen')) ?? null
    } catch {
      // 不支持或被拒绝就算了
    }
  }
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && phase === 'running') void requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      void lockRef.current?.release?.().catch(() => {})
    }
  }, [phase])

  async function finalize(result: Exclude<FocusSession['result'], 'running'>) {
    if (!session) return
    const ended: FocusSession = { ...session, result, endedAt: Date.now() }
    setSession(ended)
    await finalizeFocusSession(dateRef.current, session.id, result)
    onChanged()
  }

  async function start() {
    const s = await startFocusSession(dateRef.current, minutes, commitment)
    setSession(s)
    setUsedStuck(false)
    setNowMs(Date.now())
    setPhase('running')
    onChanged()
    warmChime() // 手势里预热音频，结束时才响得出来（iOS）
    void requestWakeLock()
  }

  function anotherRound() {
    setSession(null)
    setPhase('entry')
  }

  // ---------- 入口：交付承诺 ----------
  if (phase === 'entry') {
    return (
      <Screen>
        <p className="text-sm text-ink-soft">深度执行</p>
        <h1 className="mt-6 font-display text-3xl leading-snug">这一轮结束，我交付：</h1>
        <textarea
          value={commitment}
          onChange={(e) => setCommitment(e.target.value)}
          rows={3}
          maxLength={200}
          placeholder="一个看得见的成果，不是「想一下」"
          className="mt-5 w-full resize-none border-b border-ink/25 bg-transparent px-1 py-2 text-[15px] leading-relaxed outline-none transition-colors placeholder:text-ink-soft/50 focus:border-ember/60"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {DELIVERABLE_TEMPLATES.map((t) => (
            <Chip key={t} onClick={() => setCommitment(t)}>
              {t}
            </Chip>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          {FOCUS_LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className={`flex-1 rounded-2xl border px-4 py-3 text-base transition ${
                minutes === m ? 'border-ember bg-ember/10 text-ember' : 'border-ink/15 text-ink-soft'
              }`}
            >
              {m} 分钟
            </button>
          ))}
        </div>
        <div className="mt-auto space-y-3 pb-4 pt-6">
          <PrimaryButton disabled={!commitment.trim()} onClick={() => void start()}>
            开始
          </PrimaryButton>
          <GhostButton onClick={onExit}>先回主页</GhostButton>
        </div>
      </Screen>
    )
  }

  // ---------- 结束确认 ----------
  if (phase === 'ended') {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="font-display text-5xl">时间到。</h1>
          <p className="mt-6 max-w-xs rounded-2xl bg-paper-deep px-5 py-4 text-left text-[15px] leading-relaxed">
            这一轮承诺：{session?.commitment}
          </p>
          <div className="mt-10 w-full space-y-3">
            <PrimaryButton onClick={() => session && onDeliver(session.commitment)}>
              交付完成，记下成果
            </PrimaryButton>
            <GhostButton onClick={anotherRound}>还差一点，再来一轮</GhostButton>
            <GhostButton onClick={onExit}>先回主页</GhostButton>
          </div>
        </div>
      </Screen>
    )
  }

  // ---------- 计时中 ----------
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="max-w-xs text-center text-sm leading-relaxed text-ink-soft">
          这一轮交付：{session?.commitment}
        </p>
        <p className="tnum mt-8 font-display text-[5.5rem] font-bold leading-none tracking-tight">
          {fmt(remaining)}
        </p>
        {/* 进度轨：一条线，不是表盘 */}
        <div className="mt-6 h-[3px] w-40 overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full bg-ember transition-[width] duration-500 ease-linear"
            style={{
              width: `${Math.min(100, 100 * (1 - remaining / ((session?.minutes ?? 25) * 60_000)))}%`,
            }}
          />
        </div>
        <p className="mt-8 text-sm text-ink-soft">先把东西做出来，再追求完美。</p>
      </div>

      {stuckOpen ? (
        <div
          className="fixed inset-0 z-10 flex items-end bg-ink/30 animate-[fade-in_180ms_var(--ease-out)]"
          onClick={() => setStuckOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-paper px-6 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1rem))] pt-6 animate-[sheet-up_250ms_var(--ease-out)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl">卡住了？</h2>
            <p className="mt-2 text-sm text-ink-soft">不换方向，只降低当前动作的难度。计时不停。</p>
            <div className="mt-4 space-y-2">
              {DOWNGRADE_SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => {
                    setUsedStuck(true)
                    setStuckOpen(false)
                  }}
                  className="w-full rounded-2xl border border-ink/15 bg-paper-deep/60 px-4 py-3 text-left active:scale-[0.98] transition"
                >
                  <span className="block text-[15px]">{s.title}</span>
                  <span className="mt-0.5 block text-sm text-ink-soft">{s.desc}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStuckOpen(false)}
              className="mt-4 w-full rounded-2xl bg-ember px-6 py-3.5 text-base font-semibold text-paper active:scale-[0.98] transition"
            >
              继续
            </button>
          </div>
        </div>
      ) : confirmAbandon ? (
        <div className="space-y-3 pb-4">
          <p className="text-center text-sm text-ink-soft">这轮不要了？没关系，回来就算数。</p>
          <GhostButton onClick={() => setConfirmAbandon(false)}>继续做</GhostButton>
          <GhostButton
            onClick={() => {
              void finalize('abandoned').then(onExit)
            }}
          >
            不要了
          </GhostButton>
        </div>
      ) : (
        <div className="space-y-3 pb-4">
          <GhostButton onClick={() => setStuckOpen(true)}>卡住了</GhostButton>
          <GhostButton onClick={() => setConfirmAbandon(true)}>放弃这轮</GhostButton>
        </div>
      )}
    </Screen>
  )
}
