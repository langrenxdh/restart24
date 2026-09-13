import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { DayRecord, Rule } from '../db'
import { db, dateLabel, todayKey, uid } from '../db'
import { dayStatus } from '../mode'
import { exportJSON, exportWeeklyMarkdown, importJSON } from '../backup'
import { Screen } from './ui'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const smallBtnCls =
  'rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-sm text-ink-soft transition active:scale-[0.98]'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

/**
 * 成果墙（DESIGN.md §6.6）：月历热力图（绿=赢 / 灰=灰色胜利 / 空=未记录），
 * 点开某天看交付物、专注轮次、复盘摘要；附带规则库与数据导入导出。
 */
export default function WinWall({ chain, onChanged }: { chain: number; onChanged: () => void }) {
  const [days, setDays] = useState<DayRecord[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [tab, setTab] = useState<'wall' | 'rules'>('wall')
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [newRule, setNewRule] = useState('')

  async function load(): Promise<void> {
    setDays(await db.days.toArray())
    setRules((await db.rules.toArray()).sort((a, b) => b.uses - a.uses || b.updatedAt - a.updatedAt))
  }

  useEffect(() => {
    void load()
  }, [])

  const dayMap = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])

  const y = cursor.getFullYear()
  const m = cursor.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const leading = (new Date(y, m, 1).getDay() + 6) % 7
  const todayK = todayKey()
  const nowMonth = new Date().getFullYear() * 12 + new Date().getMonth()
  const canNext = y * 12 + m < nowMonth

  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthKeys = monthDays.map((d) => dateKey(y, m, d))
  const monthWins = monthKeys.filter((k) => {
    const rec = dayMap.get(k)
    return !!rec?.deliverable && !rec.deliverable.emergency
  }).length
  const monthEmergency = monthKeys.filter((k) => !!dayMap.get(k)?.deliverable?.emergency).length

  async function addRule() {
    const text = newRule.trim()
    if (!text) return
    await db.rules.put({ id: uid(), text, uses: 0, updatedAt: Date.now() })
    setNewRule('')
    await load()
  }

  async function removeRule(id: string) {
    await db.rules.delete(id)
    setRules((rs) => rs.filter((r) => r.id !== id))
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    if (!window.confirm('导入会覆盖现有的全部数据，继续？')) {
      e.target.value = ''
      return
    }
    try {
      await importJSON(text)
      await load()
      onChanged()
    } catch (err) {
      window.alert('导入失败：' + (err as Error).message)
    }
    e.target.value = ''
  }

  const selectedRec = selected ? dayMap.get(selected) : undefined

  return (
    <Screen>
      {/* 页签 */}
      <div className="flex gap-2">
        {(['wall', 'rules'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              tab === t ? 'bg-ember text-paper' : 'border border-ink/15 text-ink-soft'
            }`}
          >
            {t === 'wall' ? '成果墙' : `规则库${rules.length > 0 ? ` · ${rules.length}` : ''}`}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-ink-soft">当前连胜 {chain} 天</span>
      </div>

      {tab === 'wall' ? (
        <div className="mt-5">
          {/* 月份导航 */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setCursor(new Date(y, m - 1, 1))
                setSelected(null)
              }}
              className="rounded-full border border-ink/15 px-3 py-1.5 text-sm text-ink-soft transition active:scale-95"
            >
              ‹
            </button>
            <h2 className="font-display text-xl">
              {y} 年 {m + 1} 月
            </h2>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => {
                setCursor(new Date(y, m + 1, 1))
                setSelected(null)
              }}
              className="rounded-full border border-ink/15 px-3 py-1.5 text-sm text-ink-soft transition active:scale-95 disabled:opacity-30"
            >
              ›
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-ink-soft">
            本月 {monthWins} 胜{monthEmergency > 0 ? `（含 ${monthEmergency} 灰色）` : ''}
          </p>

          {/* 热力图 */}
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1 text-center text-xs text-ink-soft/70">
                {w}
              </div>
            ))}
            {Array.from({ length: leading }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {monthDays.map((d) => {
              const k = dateKey(y, m, d)
              const future = k > todayK
              const rec = dayMap.get(k)
              const st = rec ? dayStatus(rec) : 'lost'
              const cls = future
                ? 'bg-transparent text-ink-soft/30'
                : st === 'won'
                  ? 'bg-moss text-paper'
                  : st === 'emergencyWon'
                    ? 'bg-ink-soft/50 text-ink'
                    : 'bg-paper-deep text-ink-soft/70'
              return (
                <button
                  key={k}
                  type="button"
                  disabled={future}
                  onClick={() => setSelected(selected === k ? null : k)}
                  className={`aspect-square rounded-lg text-xs font-medium transition active:scale-95 ${cls} ${
                    selected === k ? 'ring-2 ring-ember ring-offset-1 ring-offset-paper' : ''
                  } ${k === todayK && selected !== k ? 'ring-1 ring-ember/50' : ''}`}
                >
                  {d}
                </button>
              )
            })}
          </div>

          {/* 图例 */}
          <div className="mt-3 flex items-center gap-4 text-xs text-ink-soft">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-moss" />
              赢
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-ink-soft/50" />
              灰色胜利
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-paper-deep" />
              未记录
            </span>
          </div>

          {/* 日期详情 */}
          {selected && (
            <div className="mt-4 rounded-2xl bg-paper-deep px-5 py-4 text-sm leading-relaxed">
              <p className="text-xs tracking-wide text-ink-soft">
                {dateLabel(selected)} ·{' '}
                {selectedRec
                  ? dayStatus(selectedRec) === 'won'
                    ? '赢'
                    : dayStatus(selectedRec) === 'emergencyWon'
                      ? '灰色胜利'
                      : '未记录'
                  : '未记录'}
              </p>
              {selectedRec ? (
                <div className="mt-2 space-y-1.5">
                  {selectedRec.mit && (
                    <p>
                      <span className="text-ink-soft">MIT：</span>
                      {selectedRec.mit}
                    </p>
                  )}
                  {selectedRec.deliverable && (
                    <p>
                      <span className="text-ink-soft">成果：</span>
                      {selectedRec.deliverable.text}
                      {selectedRec.deliverable.proofUrl && (
                        <a
                          href={selectedRec.deliverable.proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 text-ember underline underline-offset-2"
                        >
                          链接
                        </a>
                      )}
                    </p>
                  )}
                  {(() => {
                    const done = selectedRec.focusSessions.filter(
                      (s) => s.result === 'done' || s.result === 'downgraded',
                    )
                    if (done.length === 0) return null
                    const mins = done.reduce((sum, s) => sum + s.minutes, 0)
                    return (
                      <p>
                        <span className="text-ink-soft">专注：</span>
                        {done.length} 轮 · {mins} 分钟
                      </p>
                    )
                  })()}
                  {selectedRec.review?.best && (
                    <p>
                      <span className="text-ink-soft">最有效：</span>
                      {selectedRec.review.best}
                    </p>
                  )}
                  {selectedRec.review?.blocker && (
                    <p>
                      <span className="text-ink-soft">最大阻力：</span>
                      {selectedRec.review.blocker}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-ink-soft">这一天没有记录。没有记录的日子不算进链条。</p>
              )}
            </div>
          )}

          {/* 数据区 */}
          <div className="mt-8 border-t border-ink/10 pt-5">
            <p className="text-sm text-ink-soft">数据（本地存储，无云端）</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className={smallBtnCls} onClick={() => void exportJSON()}>
                导出 JSON 备份
              </button>
              <button type="button" className={smallBtnCls} onClick={() => void exportWeeklyMarkdown()}>
                导出本周 Markdown
              </button>
            </div>
            <label className="mt-2 block rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-center text-sm text-ink-soft">
              导入备份（覆盖现有数据）
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void onImportFile(e)}
              />
            </label>
          </div>
        </div>
      ) : (
        /* 规则库 */
        <div className="mt-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            你自己写的规则，由你自己执行。晚间流程选过的会自动累计使用次数。
          </p>
          <div className="mt-4 space-y-2">
            {rules.length === 0 && (
              <p className="text-sm text-ink-soft">还没有规则。在晚间流程里写一条，或直接在下面添加。</p>
            )}
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-ink/15 bg-white/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px] leading-relaxed">{r.text}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">用过 {r.uses} 次</p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeRule(r.id)}
                  aria-label="删除规则"
                  className="shrink-0 text-lg leading-none text-ink-soft/60"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addRule()
              }}
              placeholder="如果……我就……"
              className="w-full rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] outline-none placeholder:text-ink-soft/50 focus:border-ember/50"
            />
            <button
              type="button"
              disabled={!newRule.trim()}
              onClick={() => void addRule()}
              className="shrink-0 rounded-2xl bg-ember px-5 py-3 text-sm font-semibold text-paper transition active:scale-95 disabled:opacity-40"
            >
              添加
            </button>
          </div>
        </div>
      )}
    </Screen>
  )
}
