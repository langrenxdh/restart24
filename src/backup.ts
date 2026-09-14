import { db } from './db'
import { dayStatus, normalizeDay, type DayStatus } from './lib/domain'
import { dateLabel, shiftKey, todayKey } from './lib/dates'
import type { DayRecord, Rule, Task } from './lib/types'
import { sanitizeProofUrl } from './lib/url'

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 全量 JSON 备份 */
export async function exportJSON(): Promise<void> {
  const days = (await db.days.toArray()).map(normalizeDay)
  const rules = await db.rules.toArray()
  const tasks = await db.tasks.toArray()
  const payload = { app: 'restart24', version: 2, exportedAt: new Date().toISOString(), days, rules, tasks }
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `restart24-backup-${todayKey()}.json`,
  )
}

export interface ImportResult {
  days: number
  rules: number
  tasks: number
  skipped: number
}

/**
 * 导入备份（覆盖现有全部数据）。
 * 导入是唯一的外部数据入口，必须在这里挡住畸形数据（评审 #2）：
 * - 校验 app 标记，拒绝未知来源
 * - 每条 day 逐条归一化（补数组/字段、旧格式转换、proofUrl 白名单）
 * - rules/tasks 补默认值（缺 uses/doneAt 等不再产生 NaN 排序）
 * - 畸形条目跳过并计数，不中断整体导入
 */
export async function importJSON(text: string): Promise<ImportResult> {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('不是有效的 JSON 文件')
  }
  if (typeof data !== 'object' || data === null) throw new Error('备份文件格式不对')
  const obj = data as Record<string, unknown>
  if (obj.app !== 'restart24') throw new Error('这不是重启24 的备份文件（app 标记不匹配）')
  if (!Array.isArray(obj.days)) throw new Error('备份文件里没有 days 数据')

  let skipped = 0
  const days: DayRecord[] = []
  for (const raw of obj.days) {
    const d = raw as DayRecord
    if (typeof d?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
      skipped++
      continue
    }
    days.push(
      normalizeDay({
        ...d,
        // 数组存在时才重建（过滤畸形条目 + proofUrl 白名单）；
        // 不存在时保留原样，让 normalizeDay 处理 v2 单数 deliverable 旧格式
        ...(Array.isArray(d.deliverables)
          ? {
              deliverables: d.deliverables
                .filter((x) => x && typeof x.text === 'string' && x.text.trim())
                .map((x) => ({ ...x, proofUrl: sanitizeProofUrl(x.proofUrl) })),
            }
          : {}),
        ...(Array.isArray(d.focusSessions)
          ? {
              focusSessions: d.focusSessions.filter(
                (s) => s && typeof s.id === 'string' && typeof s.startedAt === 'number',
              ),
            }
          : {}),
      }),
    )
  }

  const now = Date.now()
  const rules: Rule[] = Array.isArray(obj.rules)
    ? obj.rules.filter((r): r is Rule => !!r && typeof (r as Rule).id === 'string' && typeof (r as Rule).text === 'string')
        .map((r) => ({ ...r, uses: typeof r.uses === 'number' ? r.uses : 0, updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now }))
    : []
  const tasks: Task[] = Array.isArray(obj.tasks)
    ? obj.tasks.filter((t): t is Task => !!t && typeof (t as Task).id === 'string' && typeof (t as Task).text === 'string')
        .map((t) => ({ ...t, createdAt: typeof t.createdAt === 'number' ? t.createdAt : now, doneAt: typeof t.doneAt === 'number' ? t.doneAt : null }))
    : []

  if (days.length === 0) throw new Error('没有一条有效的日记录')

  await db.transaction('rw', db.days, db.rules, db.tasks, async () => {
    await db.days.clear()
    await db.rules.clear()
    await db.tasks.clear()
    await db.days.bulkPut(days)
    await db.rules.bulkPut(rules)
    await db.tasks.bulkPut(tasks)
  })
  return { days: days.length, rules: rules.length, tasks: tasks.length, skipped }
}

function statusText(status: DayStatus): string {
  if (status === 'won') return '赢'
  if (status === 'emergencyWon') return '灰色胜利'
  return '未记录'
}

/** 最近 7 天的 Markdown 周报 */
export async function exportWeeklyMarkdown(): Promise<void> {
  const all = (await db.days.toArray()).map(normalizeDay)
  const map = new Map(all.map((d) => [d.date, d]))
  const today = todayKey()

  let wins = 0
  let emergencyWins = 0
  let rounds = 0
  let minutes = 0
  const lines: string[] = []

  for (let i = 6; i >= 0; i--) {
    const k = shiftKey(today, -i)
    const d = map.get(k)
    const st = d ? dayStatus(d) : 'lost'
    if (st === 'won') wins++
    if (st === 'emergencyWon') emergencyWins++
    lines.push(`## ${dateLabel(k)}`, '', `- 状态：${statusText(st)}`)
    if (d) {
      if (d.mit) lines.push(`- MIT：${d.mit}`)
      d.deliverables.forEach((dv, i) => {
        const proof = dv.proofUrl ? `（${dv.proofUrl}）` : ''
        lines.push(`- ${i === 0 ? '成果' : '追加'}：${dv.text}${proof}`)
      })
      const done = d.focusSessions.filter((s) => s.result === 'done' || s.result === 'downgraded')
      if (done.length > 0) {
        const mins = done.reduce((sum, s) => sum + s.minutes, 0)
        rounds += done.length
        minutes += mins
        lines.push(`- 专注：${done.length} 轮 · ${mins} 分钟`)
      }
      const r = d.review
      if (r) {
        if (r.best) lines.push(`- 最有效：${r.best}`)
        if (r.blocker) lines.push(`- 最大阻力：${r.blocker}`)
        if (r.keep) lines.push(`- 明天保留：${r.keep}`)
        if (r.drop) lines.push(`- 明天删除：${r.drop}`)
      }
    }
    lines.push('')
  }

  const md = [
    '# 重启24 · 周报',
    '',
    `生成于 ${dateLabel(today)} · 本周 ${wins} 胜${emergencyWins > 0 ? `（含 ${emergencyWins} 灰色）` : ''} · 专注 ${rounds} 轮 ${minutes} 分钟`,
    '',
    ...lines,
  ].join('\n')
  download(new Blob([md], { type: 'text/markdown' }), `restart24-week-${todayKey()}.md`)
}
