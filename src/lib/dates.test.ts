import { describe, expect, it } from 'vitest'
import { dateLabel, shiftKey, todayKey } from './dates'

describe('todayKey', () => {
  it('格式为本地时区 YYYY-MM-DD，月日补零', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('shiftKey', () => {
  it('跨月进位', () => {
    expect(shiftKey('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftKey('2026-03-31', -1)).toBe('2026-03-30')
  })
  it('跨年进位', () => {
    expect(shiftKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftKey('2027-01-01', -1)).toBe('2026-12-31')
  })
  it('闰年二月', () => {
    expect(shiftKey('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftKey('2026-02-28', 1)).toBe('2026-03-01') // 2026 非闰年
  })
})

describe('dateLabel', () => {
  it('输出中文长日期（含星期）', () => {
    // ICU 版本差异：有无限随空格不定，统一去掉空白再比
    expect(dateLabel('2026-09-14').replace(/\s/g, '')).toBe('2026年9月14日星期一')
  })
})
