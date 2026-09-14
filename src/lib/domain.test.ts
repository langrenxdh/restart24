import { describe, expect, it } from 'vitest'
import type { DayRecord, FocusSession } from './types'
import { SCHEMA_VERSION } from './types'
import {
  closeRunning,
  closeStaleSessions,
  computeChain,
  computeMode,
  dayStatus,
  normalizeDay,
} from './domain'
import { shiftKey, todayKey } from './dates'

function makeDay(patch: Partial<DayRecord> = {}): DayRecord {
  return {
    date: '2026-09-14',
    mit: '',
    morningDone: false,
    focusSessions: [],
    deliverables: [],
    review: null,
    anchor: null,
    resetCard: null,
    updatedAt: 0,
    ...patch,
  }
}

describe('computeMode 四态状态机', () => {
  const morning = new Date(2026, 8, 14, 10)
  const afternoon = new Date(2026, 8, 14, 16)

  it('有交付物 → won（优先于一切）', () => {
    expect(computeMode(makeDay({ deliverables: [{ text: 'x', loggedAt: 1 }] }), morning)).toBe('won')
  })
  it('MIT 已定 → focus（不论时段）', () => {
    expect(computeMode(makeDay({ mit: '写周报' }), morning)).toBe('focus')
    expect(computeMode(makeDay({ mit: '写周报' }), afternoon)).toBe('focus')
  })
  it('上午无 MIT → morning；15 点起 → quick-start', () => {
    expect(computeMode(makeDay(), new Date(2026, 8, 14, 14, 59))).toBe('morning')
    expect(computeMode(makeDay(), new Date(2026, 8, 14, 15))).toBe('quick-start')
    expect(computeMode(makeDay(), afternoon)).toBe('quick-start')
  })
  it('deliverables 非数组（脏数据）不崩，按空处理', () => {
    const dirty = { ...makeDay(), deliverables: undefined } as unknown as DayRecord
    expect(computeMode(dirty, morning)).toBe('morning')
  })
})

describe('dayStatus 赢的定义', () => {
  it('无交付物 → lost', () => {
    expect(dayStatus(makeDay())).toBe('lost')
  })
  it('首个交付物带 emergency → emergencyWon（追加正常成果不改变）', () => {
    const d = makeDay({
      deliverables: [
        { text: 'a', loggedAt: 1, emergency: true },
        { text: 'b', loggedAt: 2 },
      ],
    })
    expect(dayStatus(d)).toBe('emergencyWon')
  })
  it('首个正常 → won', () => {
    expect(dayStatus(makeDay({ deliverables: [{ text: 'a', loggedAt: 1 }] }))).toBe('won')
  })
})

describe('computeChain 连胜链条', () => {
  const today = todayKey(new Date(2026, 8, 14))
  const won = (date: string, emergency = false): DayRecord =>
    makeDay({ date, deliverables: [{ text: 'x', loggedAt: 1, ...(emergency ? { emergency: true } : {}) }] })

  it('今天赢 → 从今天起算', () => {
    expect(computeChain([won(today), won(shiftKey(today, -1))], today)).toBe(2)
  })
  it('今天还没赢 → 从昨天起算，连胜保持', () => {
    expect(computeChain([won(shiftKey(today, -1)), won(shiftKey(today, -2))], today)).toBe(2)
  })
  it('断链即停', () => {
    expect(computeChain([won(shiftKey(today, -1)), won(shiftKey(today, -3))], today)).toBe(1)
  })
  it('灰色胜利同样计数', () => {
    expect(computeChain([won(shiftKey(today, -1), true), won(shiftKey(today, -2), true)], today)).toBe(2)
  })
  it('旧格式（deliverable 单数）也能算赢', () => {
    const legacy = {
      ...makeDay({ date: shiftKey(today, -1) }),
      deliverables: undefined,
      deliverable: { text: '旧格式', loggedAt: 1 },
    } as unknown as DayRecord
    expect(computeChain([legacy], today)).toBe(1)
  })
})

describe('normalizeDay 旧格式归一化', () => {
  it('v2 单数 deliverable → 数组，且删掉旧字段', () => {
    const legacy = {
      ...makeDay(),
      deliverables: undefined,
      deliverable: { text: '旧成果', loggedAt: 1 },
    } as unknown as DayRecord
    const out = normalizeDay(legacy)
    expect(out.deliverables).toEqual([{ text: '旧成果', loggedAt: 1 }])
    expect('deliverable' in out).toBe(false)
  })
  it('deliverable 为 null → 空数组', () => {
    const legacy = { ...makeDay(), deliverables: undefined, deliverable: null } as unknown as DayRecord
    expect(normalizeDay(legacy).deliverables).toEqual([])
  })
  it('缺 focusSessions / mit / morningDone → 补默认值', () => {
    const legacy = { date: '2026-09-01', updatedAt: 1 } as unknown as DayRecord
    const out = normalizeDay(legacy)
    expect(out.focusSessions).toEqual([])
    expect(out.mit).toBe('')
    expect(out.morningDone).toBe(false)
  })
  it('盖 schemaV 且幂等', () => {
    const once = normalizeDay(makeDay())
    expect(once.schemaV).toBe(SCHEMA_VERSION)
    expect(normalizeDay(once)).toEqual(once)
  })
})

describe('会话收尾', () => {
  const running = (startedAt: number, minutes: number): FocusSession => ({
    id: 's1',
    startedAt,
    minutes,
    commitment: 'x',
    result: 'running',
  })

  it('closeRunning：全部 running → done（记交付物时）', () => {
    const day = makeDay({ focusSessions: [running(1, 25), { id: 's2', startedAt: 2, minutes: 25, commitment: '', result: 'done' }] })
    const out = closeRunning(day, 999)
    expect(out[0].result).toBe('done')
    expect(out[0].endedAt).toBe(999)
    expect(out[1].result).toBe('done') // 原本就 done 不动
  })

  it('closeStaleSessions：非今日 running，时间走满 → done', () => {
    const now = 1_000_000
    const day = makeDay({ date: '2026-09-13', focusSessions: [running(now - 26 * 60_000, 25)] })
    expect(closeStaleSessions(day, '2026-09-14', now)[0].result).toBe('done')
  })
  it('closeStaleSessions：非今日 running，时间没走满 → abandoned（诚实记录）', () => {
    const now = 1_000_000
    const day = makeDay({ date: '2026-09-13', focusSessions: [running(now - 5 * 60_000, 25)] })
    expect(closeStaleSessions(day, '2026-09-14', now)[0].result).toBe('abandoned')
  })
  it('closeStaleSessions：今天的 running 不动（留给界面恢复）', () => {
    const now = 1_000_000
    const day = makeDay({ date: '2026-09-14', focusSessions: [running(now - 5 * 60_000, 25)] })
    expect(closeStaleSessions(day, '2026-09-14', now)[0].result).toBe('running')
  })
})
