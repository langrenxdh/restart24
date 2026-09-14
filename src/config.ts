/**
 * 全部时间门槛与默认值的唯一出处（架构评审 P1-5：此前散落在 5 个文件）。
 * 时间窗只给默认值，状态优先（DESIGN.md §4.2）。
 */

/** 上午/下午分界：< 此小时没定 MIT → 晨间仪式；否则 → 30 秒压缩版 */
export const MORNING_LAST_HOUR = 15

/** 晚间复合流程入口开放时间（DESIGN.md §4.1 默认 20:30，实现取整点 20:00） */
export const EVENING_OPEN_HOUR = 20

/** 还没交付物时的「最后温柔一击」提醒时间 */
export const LATE_NIGHT_HOUR = 22

/** 午间复位窗口 */
export const RESET_WINDOW = { start: 12, end: 18 } as const

/** 专注轮时长选项（分钟） */
export const FOCUS_LENGTHS = [25, 45] as const

/** 失控日应急的最小行动时长（分钟） */
export const EMERGENCY_MINUTES = 10

/** 明日第一项任务的默认开始时间 */
export const DEFAULT_ANCHOR_START = '08:00'

/** 提醒轮询间隔（毫秒） */
export const TICK_MS = 30_000
