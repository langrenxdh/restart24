import { useCallback, useEffect, useRef, useState } from 'react'
import { computeChain, normalizeDay } from '../lib/domain'
import { shiftKey, todayKey } from '../lib/dates'
import { EVENING_OPEN_HOUR, LATE_NIGHT_HOUR, TICK_MS } from '../config'
import { db, ensureSchema, getDay, sweepStaleSessions } from '../db'
import type { Anchor, DayRecord } from '../lib/types'
import { notify } from '../notify'

export type Notice = 'evening' | 'lateNight' | null

/**
 * 今日数据的单一来源（架构评审 P1-4：此前 App/WinWall/MorningRitual/EveningFlow
 * 各自快照同一份数据，靠回调链手工同步）。
 *
 * - day/chain/relay 只从这里读，变更只走 refresh()
 * - now 每 TICK_MS 跳一次，驱动所有时间门槛重算（修复「无交互时 12:00 复位按钮不出现」）
 * - 跨天自动 refresh 并清空提醒去重（修复常驻 PWA 第二天无通知）
 * - 午夜不强切视图：进行中的计时流程由 FocusFlow/EmergencyFlow 持开轮日期继续有效
 */
export function useToday() {
  const [day, setDay] = useState<DayRecord | null>(null)
  const [chain, setChain] = useState(0)
  const [relay, setRelay] = useState<Anchor | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [notice, setNotice] = useState<Notice>(null)
  const noticedRef = useRef<Set<string>>(new Set())

  const refresh = useCallback(async (): Promise<DayRecord> => {
    const key = todayKey()
    const d = await getDay(key)
    setDay(d)
    const all = await db.days.toArray()
    setChain(computeChain(all, key))
    // 接力：读昨夜的锚点，晨间 MIT 预填
    const yesterday = await db.days.get(shiftKey(key, -1))
    setRelay(yesterday?.anchor ?? null)
    return d
  }, [])

  // 启动：清扫僵尸会话（非今日残留 running）→ 加载今日
  const initRef = useRef(false)
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    void (async () => {
      await ensureSchema()
      await sweepStaleSessions()
      await refresh()
    })()
  }, [refresh])

  // 心跳：只驱动渲染重算，时间本身永远用时间戳算
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(t)
  }, [])

  const dayKey = todayKey(new Date(now))

  // 跨天：清提醒去重 + 重读新一天（视图切换由 App 决定，计时流程不打断）
  const lastKeyRef = useRef<string>(dayKey)
  useEffect(() => {
    if (lastKeyRef.current === dayKey) return
    lastKeyRef.current = dayKey
    noticedRef.current.clear()
    void refresh()
  }, [dayKey, refresh])

  // 应用内时间提醒：20 点晚间流程 / 22 点未交付兜底（页面通知尽力而为，iOS 靠系统闹钟）
  useEffect(() => {
    if (!day) return
    const h = new Date(now).getHours()
    let next: Exclude<Notice, null> | null = null
    if (h >= LATE_NIGHT_HOUR && day.deliverables.length === 0) next = 'lateNight'
    else if (h >= EVENING_OPEN_HOUR && !day.eveningDone) next = 'evening'
    if (next && !noticedRef.current.has(next)) {
      noticedRef.current.add(next)
      if (next === 'lateNight') {
        notify('还有时间做一个 10 分钟版本', '失控日应急 · 做完就是灰色胜利，链条不断。')
      } else {
        notify('睡前 45 分钟', '复盘 + 排好明天。现在写下，明早就不用想了。')
      }
    }
    setNotice(next)
  }, [day, now])

  return { day, chain, relay, now, dayKey, notice, refresh, normalize: normalizeDay }
}
