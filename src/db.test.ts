/**
 * 持久层集成测试（fake-indexeddb）：
 * 1. v3 旧库 → v4 升级链（迁移正确性是白屏事故的直接防线）
 * 2. 事务化域函数（并发/连点安全的核心路径）
 *
 * 注意：本文件必须先播种 v3 旧库、再触发 db 打开——describe 顺序即执行顺序。
 */
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeAll, describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from './lib/types'
import { todayKey, shiftKey } from './lib/dates'

let db: typeof import('./db').db
let getDay: typeof import('./db').getDay
let updateDay: typeof import('./db').updateDay
let startFocusSession: typeof import('./db').startFocusSession
let finalizeFocusSession: typeof import('./db').finalizeFocusSession
let sweepStaleSessions: typeof import('./db').sweepStaleSessions
let appendDeliverable: typeof import('./db').appendDeliverable
let removeDeliverable: typeof import('./db').removeDeliverable
let findOrCreateOpenTask: typeof import('./db').findOrCreateOpenTask
let completeTask: typeof import('./db').completeTask

beforeAll(async () => {
  // ---- 播种一个 v3 时代的旧库（含各代旧格式记录）----
  const legacy = new Dexie('restart24')
  legacy.version(3).stores({ days: 'date', rules: 'id', tasks: 'id' })
  await legacy.open()
  await legacy.table('days').bulkPut([
    // v2 单数 deliverable
    {
      date: '2026-09-01',
      deliverable: { text: '旧格式成果', loggedAt: 1 },
      mit: '旧 MIT',
      morningDone: true,
      review: null,
      anchor: null,
      resetCard: null,
      updatedAt: 1,
    },
    // v2 更早：只有 date，其他字段全缺
    { date: '2026-09-02', updatedAt: 2 },
    // v3 新格式（已有数组）
    {
      date: '2026-09-03',
      deliverables: [{ text: '新格式', loggedAt: 3 }],
      focusSessions: [],
      mit: 'x',
      morningDone: false,
      review: null,
      anchor: null,
      resetCard: null,
      updatedAt: 3,
    },
  ] as never[])
  legacy.close()

  // ---- 打开应用库（v4）→ Dexie 运行 3→4 升级链 ----
  const mod = await import('./db')
  db = mod.db
  getDay = mod.getDay
  updateDay = mod.updateDay
  startFocusSession = mod.startFocusSession
  finalizeFocusSession = mod.finalizeFocusSession
  sweepStaleSessions = mod.sweepStaleSessions
  appendDeliverable = mod.appendDeliverable
  removeDeliverable = mod.removeDeliverable
  findOrCreateOpenTask = mod.findOrCreateOpenTask
  completeTask = mod.completeTask
  await db.open()
})

describe('v3 → v4 升级链', () => {
  it('v2 单数 deliverable 归一化为数组', async () => {
    const d = await getDay('2026-09-01')
    expect(d.deliverables).toEqual([{ text: '旧格式成果', loggedAt: 1 }])
    expect('deliverable' in d).toBe(false)
  })
  it('残缺记录补齐字段并盖 schemaV', async () => {
    const d = await getDay('2026-09-02')
    expect(d.mit).toBe('')
    expect(d.morningDone).toBe(false)
    expect(d.focusSessions).toEqual([])
    expect(d.deliverables).toEqual([])
    expect(d.schemaV).toBe(SCHEMA_VERSION)
  })
  it('新格式记录原样保留（只补版本号）', async () => {
    const d = await getDay('2026-09-03')
    expect(d.deliverables).toEqual([{ text: '新格式', loggedAt: 3 }])
    expect(d.mit).toBe('x')
  })
})

describe('专注轮域函数', () => {
  it('startFocusSession 落一条 running，可恢复', async () => {
    const date = todayKey()
    const s = await startFocusSession(date, 25, '写周报')
    expect(s.result).toBe('running')
    const d = await getDay(date)
    expect(d.focusSessions.some((x) => x.id === s.id && x.result === 'running')).toBe(true)
  })
  it('finalizeFocusSession 只改目标会话', async () => {
    const date = todayKey()
    const a = await startFocusSession(date, 25, 'A')
    const b = await startFocusSession(date, 45, 'B')
    await finalizeFocusSession(date, a.id, 'abandoned')
    const d = await getDay(date)
    expect(d.focusSessions.find((x) => x.id === a.id)?.result).toBe('abandoned')
    expect(d.focusSessions.find((x) => x.id === b.id)?.result).toBe('running')
  })
  it('sweepStaleSessions：昨日 running 时间走满 → done；今日不动', async () => {
    const today = todayKey()
    const yesterday = shiftKey(today, -1)
    await updateDay(yesterday, {
      focusSessions: [{ id: 'old', startedAt: Date.now() - 26 * 60_000, minutes: 25, commitment: '', result: 'running' }],
    })
    const runningToday = await startFocusSession(today, 25, '今天还在跑')
    await sweepStaleSessions()
    const y = await getDay(yesterday)
    expect(y.focusSessions[0].result).toBe('done')
    const t = await getDay(today)
    expect(t.focusSessions.find((x) => x.id === runningToday.id)?.result).toBe('running')
  })
})

describe('交付物域函数', () => {
  it('appendDeliverable 追加并把 running 收尾为 done', async () => {
    const date = todayKey()
    const s = await startFocusSession(date, 25, 'C')
    await appendDeliverable(date, { text: '交付了', loggedAt: Date.now() })
    const d = await getDay(date)
    expect(d.deliverables.some((x) => x.text === '交付了')).toBe(true)
    expect(d.focusSessions.find((x) => x.id === s.id)?.result).toBe('done')
  })
  it('appendDeliverable 绑定 MIT 任务时自动完成任务池条目', async () => {
    const date = todayKey()
    const task = await findOrCreateOpenTask('绑定 MIT 的任务')
    await updateDay(date, { mit: '绑定 MIT 的任务', mitTaskId: task.id })
    await appendDeliverable(date, { text: '完成', loggedAt: Date.now() })
    const done = await db.tasks.get(task.id)
    expect(done?.doneAt).toBeTruthy()
  })
  it('removeDeliverable 按下标删除且不影响其他', async () => {
    const date = shiftKey(todayKey(), -30) // 独立日期，避免其他用例的交付物混入
    await appendDeliverable(date, { text: '第一条', loggedAt: 1 })
    await appendDeliverable(date, { text: '第二条', loggedAt: 2 })
    await removeDeliverable(date, 0)
    const d = await getDay(date)
    expect(d.deliverables.map((x) => x.text)).toEqual(['第二条'])
  })
})

describe('任务池事务', () => {
  it('findOrCreateOpenTask 同文案去重', async () => {
    const a = await findOrCreateOpenTask('唯一任务')
    const b = await findOrCreateOpenTask('唯一任务')
    expect(a.id).toBe(b.id)
  })
  it('完成后同文案可再入池（不复用已完成条目）', async () => {
    const a = await findOrCreateOpenTask('做完再来一次')
    await completeTask(a.id)
    const b = await findOrCreateOpenTask('做完再来一次')
    expect(b.id).not.toBe(a.id)
    expect(b.doneAt).toBeNull()
  })
})
