/** 领域类型：纯类型，零副作用，任何模块都可安全 import。 */

export interface FocusSession {
  id: string
  startedAt: number
  minutes: number
  commitment: string
  result: 'running' | 'done' | 'downgraded' | 'abandoned'
  endedAt?: number
  /** 应急流程开的 10 分钟轮（恢复路由用；旧记录无此字段按专注轮处理） */
  kind?: 'emergency'
}

export interface Deliverable {
  text: string
  proofUrl?: string
  loggedAt: number
  emergency?: boolean // 失控日应急记录的灰色胜利
}

export interface ResetCard {
  morningDid: string
  afternoonOne: string
  startAt: string
}

export interface Anchor {
  nextStep: string
  where: string
  startTime: string
  ifThen?: string
}

export interface Rule {
  id: string
  text: string
  uses: number
  updatedAt: number
}

/** 任务池：明天的候选清单，不是义务清单。每天只选一个当 MIT。 */
export interface Task {
  id: string
  text: string
  createdAt: number
  doneAt: number | null
}

export interface DayRecord {
  date: string // YYYY-MM-DD
  mit: string
  mitTaskId?: string // MIT 绑定的任务池条目
  morningDone: boolean
  focusSessions: FocusSession[]
  deliverables: Deliverable[] // 首个 = 锁定当日胜利；之后可追加
  review: { best: string; blocker: string; action: string; keep: string; drop: string } | null
  anchor: Anchor | null
  resetCard: ResetCard | null
  eveningDone?: boolean
  /** 记录结构版本：v4 起写入；旧记录由升级链/normalizeDay 补齐 */
  schemaV?: number
  updatedAt: number
}

/** 当前 DayRecord 结构版本 */
export const SCHEMA_VERSION = 4
