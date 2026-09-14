/**
 * 领域内核（原 mode.ts + db.ts 中的纯函数收敛于此）：
 * 状态机、赢的定义、链条、旧格式归一化 —— 全部纯函数，import 不触发任何副作用，可直接单测。
 */
import { MORNING_LAST_HOUR } from '../config'
import type { DayRecord, Deliverable, FocusSession } from './types'
import { SCHEMA_VERSION } from './types'
import { shiftKey } from './dates'

/**
 * 四态状态机（DESIGN.md §4 的子集）：
 * - won        今天已记录交付物，赢了
 * - focus      MIT 已定，进入深度执行
 * - morning    上午且还没定 MIT → 晨间仪式
 * - quick-start 下午/晚上还没定 MIT → 30 秒压缩版（永不责备）
 *
 * 时间窗只给默认值，状态优先。
 */
export type Mode = 'morning' | 'quick-start' | 'focus' | 'won'

export function computeMode(day: DayRecord, now = new Date()): Mode {
  const deliverables = Array.isArray(day.deliverables) ? day.deliverables : []
  if (deliverables.length > 0) return 'won'
  if (day.mit.trim()) return 'focus'
  return now.getHours() < MORNING_LAST_HOUR ? 'morning' : 'quick-start'
}

/** 当日状态：emergencyWon = 失控日的灰色胜利（链条不断），以首个交付物为准 */
export type DayStatus = 'won' | 'emergencyWon' | 'lost'

export function dayStatus(day: DayRecord): DayStatus {
  const deliverables = Array.isArray(day.deliverables) ? day.deliverables : []
  if (deliverables.length === 0) return 'lost'
  return deliverables[0].emergency ? 'emergencyWon' : 'won'
}

/** 归一化：兼容 v2 及更早的旧记录，补齐缺失字段并盖结构版本号 */
export function normalizeDay(d: DayRecord): DayRecord {
  let out = d
  if (!Array.isArray(out.deliverables)) {
    const legacy = (out as DayRecord & { deliverable?: Deliverable | null }).deliverable
    const { deliverable: _drop, ...rest } = out as DayRecord & { deliverable?: unknown }
    out = { ...rest, deliverables: legacy ? [legacy] : [] }
  }
  if (!Array.isArray(out.focusSessions)) {
    out = { ...out, focusSessions: [] }
  }
  if (typeof out.mit !== 'string') {
    out = { ...out, mit: '' }
  }
  if (typeof out.morningDone !== 'boolean') {
    out = { ...out, morningDone: false }
  }
  if (out.schemaV !== SCHEMA_VERSION) {
    out = { ...out, schemaV: SCHEMA_VERSION }
  }
  return out
}

/** 把仍在 running 的专注轮收尾为 done（记录交付物时调用） */
export function closeRunning(day: DayRecord, now = Date.now()): FocusSession[] {
  return day.focusSessions.map((s) =>
    s.result === 'running' ? { ...s, result: 'done' as const, endedAt: now } : s,
  )
}

/**
 * 清扫僵尸会话：running 但已不可能继续的专注轮。
 * - 时间已走满 → done（时间到了就算完成，分钟数计入统计）
 * - 时间没走满 → abandoned（被打断，诚实记录不算完成）
 * 只处理 keepDate 之外日期的记录；今天的运行中会话留给界面恢复。
 */
export function closeStaleSessions(day: DayRecord, keepDate: string, now = Date.now()): FocusSession[] {
  if (day.date === keepDate) return day.focusSessions
  return day.focusSessions.map((s) => {
    if (s.result !== 'running') return s
    const elapsed = now >= s.startedAt + s.minutes * 60_000
    return { ...s, result: elapsed ? ('done' as const) : ('abandoned' as const), endedAt: now }
  })
}

/** 连续有交付物的天数：从今天往回数；今天还没交付则从昨天数。灰色胜利同样计数。 */
export function computeChain(days: DayRecord[], today: string): number {
  const won = new Set(
    days.map(normalizeDay).filter((d) => d.deliverables.length > 0).map((d) => d.date),
  )
  let chain = 0
  let cursor = won.has(today) ? today : shiftKey(today, -1)
  while (won.has(cursor)) {
    chain++
    cursor = shiftKey(cursor, -1)
  }
  return chain
}
