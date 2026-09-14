/**
 * 持久层：Dexie 实例 + schema 版本链 + 仓储 + 事务化域函数。
 * 纯领域逻辑（状态机/链条/归一化/日期）在 src/lib/，测试请勿 import 本文件
 * （import 即建库；需要测迁移时用 fake-indexeddb，见 db.migration.test.ts）。
 */
import Dexie, { type Table } from 'dexie'
import { SCHEMA_VERSION, type DayRecord, type Deliverable, type FocusSession, type Rule, type Task } from './lib/types'
import { closeRunning, closeStaleSessions, normalizeDay } from './lib/domain'
import { todayKey } from './lib/dates'

class RestartDB extends Dexie {
  days!: Table<DayRecord, string>
  rules!: Table<Rule, string>
  tasks!: Table<Task, string>

  constructor() {
    super('restart24')
    this.version(1).stores({ days: 'date' })
    this.version(2).stores({ days: 'date', rules: 'id' })
    this.version(3).stores({ days: 'date', rules: 'id', tasks: 'id' })
    // v4（2026-09）：版本化迁移取代散布各处的防御性归一化。
    // 任何 v≤3 记录在此一次性归一化（deliverable→deliverables、补数组、盖章 schemaV）。
    this.version(4)
      .stores({ days: 'date', rules: 'id', tasks: 'id' })
      .upgrade(async (tx) => {
        const days = tx.table('days')
        const records = await days.toArray()
        await days.bulkPut(records.map(normalizeDay))
      })
  }
}

export const db = new RestartDB()

export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 启动兜底清扫（v≤3 时代的过渡机制，sunset：全量用户跑过 v4 升级链后可移除）。
 * 只处理 v4 升级链覆盖不到的漏网旧格式（如旧标签页在升级后写回的单条旧记录）。
 */
let schemaSwept = false
export async function ensureSchema(): Promise<void> {
  if (schemaSwept) return
  schemaSwept = true
  const stale = (await db.days.toArray()).filter((d) => d.schemaV !== SCHEMA_VERSION)
  for (const d of stale) await db.days.put(normalizeDay(d))
}

export async function getDay(date: string): Promise<DayRecord> {
  const found = await db.days.get(date)
  if (found) {
    if (found.schemaV === SCHEMA_VERSION) return found
    const normalized = normalizeDay(found)
    await db.days.put(normalized)
    return normalized
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
    schemaV: SCHEMA_VERSION,
    updatedAt: Date.now(),
  }
  await db.days.put(fresh)
  return fresh
}

/**
 * 标量字段的浅合并更新（review/anchor/resetCard/mit/eveningDone…）。
 * 注意：不要用它传 focusSessions/deliverables 数组——数组突变必须走下方的事务化域函数，
 * 否则陈旧快照会整体覆写并发写入（架构评审 P0-2 的教训）。
 */
export async function updateDay(date: string, patch: Partial<DayRecord>): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    const day = await getDay(date)
    await db.days.put({ ...day, ...patch, updatedAt: Date.now() })
  })
}

// ---------- 专注轮（事务化域函数） ----------

/** 开始一轮专注/应急：事务内追加 running 会话，返回带 id/startedAt 的记录供倒计时用 */
export async function startFocusSession(
  date: string,
  minutes: number,
  commitment: string,
  kind?: 'emergency',
): Promise<FocusSession> {
  const s: FocusSession = {
    id: uid(),
    startedAt: Date.now(),
    minutes,
    commitment: commitment.trim(),
    result: 'running',
    ...(kind ? { kind } : {}),
  }
  await db.transaction('rw', db.days, async () => {
    const day = await getDay(date)
    await db.days.put({ ...day, focusSessions: [...day.focusSessions, s], updatedAt: Date.now() })
  })
  return s
}

/** 收尾一轮：事务内按 id 定位改状态，不依赖调用方的陈旧快照 */
export async function finalizeFocusSession(
  date: string,
  sessionId: string,
  result: Exclude<FocusSession['result'], 'running'>,
): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    const day = await getDay(date)
    const focusSessions = day.focusSessions.map((s) =>
      s.id === sessionId ? { ...s, result, endedAt: Date.now() } : s,
    )
    await db.days.put({ ...day, focusSessions, updatedAt: Date.now() })
  })
}

/** 启动清扫：把非今日残留的 running 会话收尾归档（时间走满→done，没走满→abandoned） */
export async function sweepStaleSessions(now = Date.now()): Promise<void> {
  const today = todayKey(new Date(now))
  await db.transaction('rw', db.days, async () => {
    const days = await db.days.toArray()
    for (const d of days) {
      if (!d.focusSessions?.some((s) => s.result === 'running')) continue
      if (d.date === today) continue
      await db.days.put({ ...d, focusSessions: closeStaleSessions(d, today, now), updatedAt: now })
    }
  })
}

// ---------- 交付物 ----------

/** 追加一个交付物（全事务：读取-修改-写入原子完成，连点/并发不会产生重复记录） */
export async function appendDeliverable(date: string, d: Deliverable): Promise<void> {
  let mitTaskId: string | undefined
  await db.transaction('rw', db.days, async () => {
    const day = await getDay(date)
    mitTaskId = day.mitTaskId
    await db.days.put({
      ...day,
      deliverables: [...day.deliverables, d],
      focusSessions: closeRunning(day),
      updatedAt: Date.now(),
    })
  })
  if (mitTaskId) await completeTask(mitTaskId)
}

/** 删除某天的某条成果记录（清理误录重复项；全事务） */
export async function removeDeliverable(date: string, index: number): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    const day = await getDay(date)
    await db.days.put({
      ...day,
      deliverables: day.deliverables.filter((_, i) => i !== index),
      updatedAt: Date.now(),
    })
  })
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

/** 找同文案的未完成任务，没有才新建（防重复入池；check-then-put 全事务） */
export async function findOrCreateOpenTask(text: string): Promise<Task> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('任务内容为空')
  return db.transaction('rw', db.tasks, async () => {
    const existing = await db.tasks.filter((t) => !t.doneAt && t.text === trimmed).first()
    if (existing) return existing
    const t: Task = { id: uid(), text: trimmed, createdAt: Date.now(), doneAt: null }
    await db.tasks.put(t)
    return t
  })
}

export async function updateTaskText(id: string, text: string): Promise<void> {
  const t = await db.tasks.get(id)
  if (t && text.trim()) await db.tasks.put({ ...t, text: text.trim() })
}

export async function completeTask(id: string): Promise<void> {
  const t = await db.tasks.get(id)
  if (t && !t.doneAt) await db.tasks.put({ ...t, doneAt: Date.now() })
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}

// ---------- 规则库 ----------

/** 最近使用的 If-Then 规则（按使用次数排序） */
export async function getRecentRules(limit = 5): Promise<Rule[]> {
  const all = await db.rules.toArray()
  return all.sort((a, b) => b.uses - a.uses || b.updatedAt - a.updatedAt).slice(0, limit)
}

/** 记录一条 If-Then 的使用：已存在则 +1，否则新建（全事务） */
export async function upsertRuleByText(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  await db.transaction('rw', db.rules, async () => {
    const existing = await db.rules.filter((r) => r.text === trimmed).first()
    if (existing) {
      await db.rules.put({ ...existing, uses: existing.uses + 1, updatedAt: Date.now() })
    } else {
      await db.rules.put({ id: uid(), text: trimmed, uses: 1, updatedAt: Date.now() })
    }
  })
}

export async function removeRule(id: string): Promise<void> {
  await db.rules.delete(id)
}
