import type { DayRecord } from './db'

/**
 * M1 的四态状态机（DESIGN.md §4 的子集）：
 * - won        今天已记录交付物，赢了
 * - focus      MIT 已定，进入深度执行
 * - morning    上午且还没定 MIT → 晨间仪式
 * - quick-start 下午/晚上还没定 MIT → 30 秒压缩版（永不责备）
 *
 * 时间窗只给默认值，状态优先；完成后 M2 再加手动切换。
 */
export type Mode = 'morning' | 'quick-start' | 'focus' | 'won'

export function computeMode(day: DayRecord, now = new Date()): Mode {
  const deliverables = Array.isArray(day.deliverables) ? day.deliverables : []
  if (deliverables.length > 0) return 'won'
  if (day.mit.trim()) return 'focus'
  return now.getHours() < 15 ? 'morning' : 'quick-start'
}

/** 当日状态：emergencyWon = 失控日的灰色胜利（链条不断），以首个交付物为准 */
export type DayStatus = 'won' | 'emergencyWon' | 'lost'

export function dayStatus(day: DayRecord): DayStatus {
  const deliverables = Array.isArray(day.deliverables) ? day.deliverables : []
  if (deliverables.length === 0) return 'lost'
  return deliverables[0].emergency ? 'emergencyWon' : 'won'
}
