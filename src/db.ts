import Dexie, { type Table } from 'dexie'

export interface FocusSession {
  id: string
  startedAt: number
  minutes: number
  commitment: string
  result: 'running' | 'done' | 'downgraded' | 'abandoned'
  endedAt?: number
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
  updatedAt: number
}

class RestartDB extends Dexie {
  days!: Table<DayRecord, string>
  rules!: Table<Rule, string>
  tasks!: Table<Task, string>

  constructor() {
    super('restart24')
    this.version(1).stores({ days: 'date' })
    this.version(2).stores({ days: 'date', rules: 'id' })
    this.version(3).stores({ days: 'date', rules: 'id', tasks: 'id' })
  }
}

export const db = new RestartDB()

export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return todayKey(dt)
}

export async function getDay(date: string): Promise<DayRecord> {
  const found = await db.days.get(date)
  if (found) {
    // 旧数据迁移：deliverable（单个）→ deliverables（数组）
    const legacy = (found as DayRecord & { deliverable?: Deliverable | null }).deliverable
    const hasArray = Array.isArray(found.deliverables)
    if ((legacy || !hasArray)) {
      const normalized: DayRecord = {
        ...found,
        deliverables: hasArray && found.deliverables.length > 0 ? found.deliverables : legacy ? [legacy] : [],
      }
      delete (normalized as DayRecord & { deliverable?: unknown }).deliverable
      await db.days.put(normalized)
      return normalized
    }
    return found
  }
  const fresh: DayRecord = {
    date,
    mit: '',
    morningDone: false,
    focusSessions: [],
    deliverables: [],
    review: null,
    anchor: null,
    resetCard: null,
    updatedAt: Date.now(),
  }
  await db.days.put(fresh)
  return fresh
}

export async function updateDay(date: string, patch: Partial<DayRecord>): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    const day = await getDay(date)
    await db.days.put({ ...day, ...patch, updatedAt: Date.now() })
  })
}

/** 把仍在 running 的专注轮收尾为 done（记录交付物时调用） */
export function closeRunning(day: DayRecord): FocusSession[] {
  return day.focusSessions.map((s) =>
    s.result === 'running' ? { ...s, result: 'done' as const, endedAt: Date.now() } : s,
  )
}

/** 追加一个交付物：首个锁定当日胜利，后续为追加成果；同时收尾 running 轮、勾掉绑定的池任务 */
export async function appendDeliverable(day: DayRecord, d: Deliverable): Promise<void> {
  await updateDay(day.date, {
    deliverables: [...day.deliverables, d],
    focusSessions: closeRunning(day),
  })
  if (day.mitTaskId) await completeTask(day.mitTaskId)
}

/** 连续有交付物的天数：从今天往回数；今天还没交付则从昨天数 */
export function computeChain(days: DayRecord[], today: string): number {
  const won = new Set(days.filter((d) => d.deliverables.length > 0).map((d) => d.date))
  let chain = 0
  let cursor = won.has(today) ? today : shiftKey(today, -1)
  while (won.has(cursor)) {
    chain++
    cursor = shiftKey(cursor, -1)
  }
  return chain
}

// ---------- 任务池 ----------

export async function getOpenTasks(): Promise<Task[]> {
  return (await db.tasks.toArray())
    .filter((t) => !t.doneAt)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function addTask(text: string): Promise<Task> {
  const t: Task = { id: uid(), text: text.trim(), createdAt: Date.now(), doneAt: null }
  await db.tasks.put(t)
  return t
}

export async function completeTask(id: string): Promise<void> {
  const t = await db.tasks.get(id)
  if (t && !t.doneAt) await db.tasks.put({ ...t, doneAt: Date.now() })
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}

/** 最近使用的 If-Then 规则（按使用次数排序） */
export async function getRecentRules(limit = 5): Promise<Rule[]> {
  const all = await db.rules.toArray()
  return all.sort((a, b) => b.uses - a.uses || b.updatedAt - a.updatedAt).slice(0, limit)
}

/** 记录一条 If-Then 的使用：已存在则 +1，否则新建 */
export async function upsertRuleByText(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  const existing = await db.rules.filter((r) => r.text === trimmed).first()
  if (existing) {
    await db.rules.put({ ...existing, uses: existing.uses + 1, updatedAt: Date.now() })
  } else {
    await db.rules.put({ id: uid(), text: trimmed, uses: 1, updatedAt: Date.now() })
  }
}

export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(y, m - 1, d))
}
