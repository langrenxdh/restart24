import { db, dateLabel, shiftKey, todayKey, type DayRecord, type Rule, type Task } from './db'
import { dayStatus, type DayStatus } from './mode'

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
  const days = await db.days.toArray()
  const rules = await db.rules.toArray()
  const tasks = await db.tasks.toArray()
  const payload = { app: 'restart24', version: 2, exportedAt: new Date().toISOString(), days, rules, tasks }
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `restart24-backup-${todayKey()}.json`,
  )
}

/** 导入备份（覆盖现有全部数据） */
export async function importJSON(text: string): Promise<void> {
  const data = JSON.parse(text) as { days?: unknown[]; rules?: unknown[]; tasks?: unknown[] }
  if (!Array.isArray(data.days)) throw new Error('备份文件里没有 days 数据')
  const days = data.days.filter((d): d is DayRecord => typeof (d as DayRecord)?.date === 'string')
  const rules = Array.isArray(data.rules)
    ? data.rules.filter((r): r is Rule => {
        const rule = r as Rule
        return typeof rule?.id === 'string' && typeof rule?.text === 'string'
      })
    : []
  const tasks = Array.isArray(data.tasks)
    ? data.tasks.filter((t): t is Task => {
        const task = t as Task
        return typeof task?.id === 'string' && typeof task?.text === 'string'
      })
    : []
  await db.transaction('rw', db.days, db.rules, db.tasks, async () => {
    await db.days.clear()
    await db.rules.clear()
    await db.tasks.clear()
    await db.days.bulkPut(days)
    await db.rules.bulkPut(rules)
    await db.tasks.bulkPut(tasks)
  })
}

function statusText(status: DayStatus): string {
  if (status === 'won') return '赢'
  if (status === 'emergencyWon') return '灰色胜利'
  return '未记录'
}

/** 最近 7 天的 Markdown 周报 */
export async function exportWeeklyMarkdown(): Promise<void> {
  const all = await db.days.toArray()
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
