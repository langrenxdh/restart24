import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { DayRecord, Rule, Task } from '../lib/types'
import { dayStatus, normalizeDay, type DayStatus } from '../lib/domain'
import { dateLabel, todayKey } from '../lib/dates'
import { sanitizeProofUrl } from '../lib/url'
import {
  addTask,
  completeTask,
  db,
  deleteTask,
  removeDeliverable,
  removeRule,
  uid,
  updateTaskText,
} from '../db'
import { exportJSON, exportWeeklyMarkdown, importJSON } from '../backup'
import { noticeGranted, noticeSupported } from '../notify'
import { Screen } from './ui'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** 汉字题款：二〇二六 · 九月 */
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const CN_MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
function cnYear(y: number): string {
  return String(y).split('').map((d) => CN_DIGITS[+d]).join('')
}

const smallBtnCls =
  'rounded-2xl border border-ink/15 bg-paper-deep/60 px-4 py-3 text-sm text-ink-soft transition active:scale-[0.98]'

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
  const [tasks, setTasks] = useState<Task[]>([])
  const [tab, setTab] = useState<'wall' | 'rules' | 'tasks'>('wall')
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [newRule, setNewRule] = useState('')
  const [newTask, setNewTask] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [notificationDenied, setNotificationDenied] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'denied',
  )

  async function load(): Promise<void> {
    setDays((await db.days.toArray()).map(normalizeDay))
    setRules((await db.rules.toArray()).sort((a, b) => b.uses - a.uses || b.updatedAt - a.updatedAt))
    setTasks(
      (await db.tasks.toArray()).sort((a, b) => {
        if (!!a.doneAt !== !!b.doneAt) return a.doneAt ? 1 : -1
        return (b.doneAt ?? b.createdAt) - (a.doneAt ?? a.createdAt)
      }),
    )
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
  const statusOf = (k: string): DayStatus => {
    const rec = dayMap.get(k)
    return rec ? dayStatus(rec) : 'lost'
  }
  const monthWins = monthKeys.filter((k) => statusOf(k) === 'won').length
  const monthEmergency = monthKeys.filter((k) => statusOf(k) === 'emergencyWon').length

  async function addRule() {
    const text = newRule.trim()
    if (!text) return
    await db.rules.put({ id: uid(), text, uses: 0, updatedAt: Date.now() })
    setNewRule('')
    await load()
  }

  async function addTaskFromInput() {
    const text = newTask.trim()
    if (!text) return
    await addTask(text)
    setNewTask('')
    await load()
  }

  /** 完成：乐观更新（界面立即反应），再落库；连点只记一次 */
  function completeTaskNow(id: string) {
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, doneAt: x.doneAt ?? Date.now() } : x)))
    void completeTask(id).then(load)
  }

  function deleteTaskNow(id: string) {
    setTasks((ts) => ts.filter((x) => x.id !== id))
    void deleteTask(id)
  }

  async function saveTaskEdit(id: string) {
    setEditingId(null)
    await updateTaskText(id, editText)
    await load()
  }

  /** 删除某天的某条成果记录（用于清理误录的重复项；全事务） */
  async function removeDeliverableAt(date: string, index: number) {
    if (!window.confirm('删除这条成果记录？连胜会按剩余记录重新计算。')) return
    await removeDeliverable(date, index)
    await load()
    onChanged()
  }

  async function removeRuleById(id: string) {
    await removeRule(id)
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
      const r = await importJSON(text)
      await load()
      onChanged()
      window.alert(
        `导入完成：${r.days} 天记录、${r.rules} 条规则、${r.tasks} 个任务${r.skipped > 0 ? `（跳过 ${r.skipped} 条无效数据）` : ''}`,
      )
    } catch (err) {
      window.alert('导入失败：' + (err as Error).message)
    }
    e.target.value = ''
  }

  const selectedRec = selected ? dayMap.get(selected) : undefined

  return (
    <Screen>
      {/* 页签（计数不折行：导航几何不随数据变化） */}
      <div className="flex gap-2">
        {(['wall', 'rules', 'tasks'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-full px-4 py-2.5 text-sm transition ${
              tab === t ? 'bg-ember text-paper' : 'border border-ink/15 text-ink-soft'
            }`}
          >
            {t === 'wall' ? '成果墙' : t === 'rules' ? `规则库${rules.length > 0 ? ` · ${rules.length}` : ''}` : `任务池${tasks.filter((x) => !x.doneAt).length > 0 ? ` · ${tasks.filter((x) => !x.doneAt).length}` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'wall' ? (
        <div className="mt-5">
          {/* 断链补偿（DESIGN §6.6：永不责备） */}
          {chain === 0 && days.some((d) => d.deliverables.length > 0 && d.date < todayK) && (
            <p className="mb-4 rounded-2xl bg-paper-deep px-4 py-3 text-sm leading-relaxed text-ink-soft">
              链条断了？重新开始也是系统的一部分。今天一个 10 分钟的最小行动，就能开一条新链。
            </p>
          )}
          {/* 月份导航 */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setCursor(new Date(y, m - 1, 1))
                setSelected(null)
              }}
              aria-label="上个月"
              className="min-w-[44px] rounded-full border border-ink/15 px-3 py-2 text-sm text-ink-soft transition active:scale-95"
            >
              ‹
            </button>
            <h2 className="font-display text-xl">
              {cnYear(y)} 年 · {CN_MONTHS[m]} 月
            </h2>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => {
                setCursor(new Date(y, m + 1, 1))
                setSelected(null)
              }}
              aria-label="下个月"
              className="min-w-[44px] rounded-full border border-ink/15 px-3 py-2 text-sm text-ink-soft transition active:scale-95 disabled:opacity-30"
            >
              ›
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-ink-soft">
            本月 {monthWins} 胜{monthEmergency > 0 ? `（含 ${monthEmergency} 灰色）` : ''}
            {chain > 0 && ` · 连胜 ${chain} 天`}
            {monthWins + monthEmergency === 0 && !canNext && ' · 今天这一格，从一次 25 分钟专注开始'}
          </p>

          {/* 热力图：庭园式——赢的日子只见色块不见数字，浓淡随成果数 */}
          <div className="mt-4 grid grid-cols-7 gap-2">
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
              const stLabel = st === 'won' ? '赢' : st === 'emergencyWon' ? '灰色胜利' : future ? '未来' : '未记录'
              const rich = (rec?.deliverables.length ?? 0) >= 2
              const cls = future
                ? 'bg-transparent text-ink-soft/30'
                : st === 'won'
                  ? `${rich ? 'bg-moss' : 'bg-moss/70'} text-transparent`
                  : st === 'emergencyWon'
                    ? 'bg-ink-soft/50 text-transparent'
                    : 'bg-paper-deep text-ink-soft/70'
              return (
                <button
                  key={k}
                  type="button"
                  disabled={future}
                  aria-label={`${m + 1}月${d}日，${stLabel}${st === 'won' && rich ? '（多个成果）' : ''}`}
                  title={`${m + 1}月${d}日 · ${stLabel}`}
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
                  {selectedRec.deliverables.map((d, i) => (
                    <p key={i} className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="text-ink-soft">{i === 0 ? '成果：' : '追加：'}</span>
                        {d.text}
                        {sanitizeProofUrl(d.proofUrl) && (
                          <a
                            href={sanitizeProofUrl(d.proofUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 text-ember underline underline-offset-2"
                          >
                            链接
                          </a>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => void removeDeliverableAt(selected, i)}
                        aria-label="删除这条成果"
                        className="shrink-0 pt-0.5 text-xs text-ink-soft/60"
                      >
                        删除
                      </button>
                    </p>
                  ))}
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
            <label className="mt-2 block rounded-2xl border border-ink/15 bg-paper-deep/60 px-4 py-3 text-center text-sm text-ink-soft">
              导入备份（覆盖现有数据）
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void onImportFile(e)}
              />
            </label>
            {/* 提醒开关：安装卡关掉后这里仍可开启 */}
            {noticeSupported() && (
              <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-soft">应用内提醒</span>
                {noticeGranted() ? (
                  <span className="text-moss-deep">已开启</span>
                ) : notificationDenied ? (
                  <span className="text-ink-soft/70">已被浏览器拒绝，到站点权限里重新允许</span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void Notification.requestPermission().then(() =>
                        setNotificationDenied(Notification.permission === 'denied'),
                      )
                    }
                    className="-my-1.5 py-1.5 text-ember-deep underline underline-offset-4"
                  >
                    开启
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : tab === 'rules' ? (
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
                className="flex items-center justify-between gap-3 rounded-2xl border border-ink/15 bg-paper-deep/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[15px] leading-relaxed">{r.text}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">用过 {r.uses} 次</p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeRuleById(r.id)}
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
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addRule()
              }}
              placeholder="如果……我就……"
              className="w-full rounded-2xl border border-ink/15 bg-paper-deep/60 px-4 py-3 text-[15px] outline-none placeholder:text-ink-soft/50 focus:border-ember/50"
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
      ) : (
        /* 任务池 */
        <div className="mt-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            池子是明天的候选，不是义务清单。每天早晨只选一个当 MIT，完成自动勾掉。
          </p>
          <div className="mt-4 space-y-2">
            {tasks.filter((t) => !t.doneAt).length === 0 && (
              <p className="text-sm text-ink-soft">池子是空的。晨间写下的任务没做完时，晚间流程可以一键放回来。</p>
            )}
            {tasks
              .filter((t) => !t.doneAt)
              .map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-ink/15 bg-paper-deep/60 px-4 py-3"
                >
                  {editingId === t.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editText}
                        autoFocus
                        maxLength={100}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveTaskEdit(t.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="w-full rounded-xl border border-ember/40 bg-white px-3 py-2 text-[15px] outline-none"
                      />
                      <button
                        type="button"
                        disabled={!editText.trim()}
                        onClick={() => void saveTaskEdit(t.id)}
                        className="shrink-0 rounded-xl bg-ember px-3 py-2 text-sm font-semibold text-paper disabled:opacity-40"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="shrink-0 px-1 text-sm text-ink-soft"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 text-[15px] leading-relaxed">{t.text}</p>
                      <div className="flex shrink-0 items-center gap-1 text-sm">
                        <button
                          type="button"
                          onClick={() => completeTaskNow(t.id)}
                          className="-my-2 rounded-lg px-2.5 py-2 text-moss underline underline-offset-4"
                        >
                          完成
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(t.id)
                            setEditText(t.text)
                          }}
                          className="-my-2 rounded-lg px-2.5 py-2 text-ink-soft underline underline-offset-4"
                        >
                          改
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTaskNow(t.id)}
                          aria-label="删除任务"
                          className="-my-2 rounded-lg px-2.5 py-2 text-ink-soft/80"
                        >
                          删
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
          {tasks.some((t) => t.doneAt) && (
            <>
              <p className="mt-6 text-xs tracking-wide text-ink-soft">
                已完成 · {tasks.filter((t) => t.doneAt).length}
              </p>
              <div className="mt-2 space-y-2">
                {tasks
                  .filter((t) => t.doneAt)
                  .slice(0, 10)
                  .map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-1">
                      <p className="min-w-0 truncate text-sm text-ink-soft/70 line-through">{t.text}</p>
                      <button
                        type="button"
                        onClick={() => void deleteTask(t.id).then(load)}
                        aria-label="删除任务"
                        className="shrink-0 text-sm leading-none text-ink-soft/50"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
          <div className="mt-4 flex gap-2">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addTaskFromInput()
              }}
              placeholder="往池子里放一个候选任务…"
              className="w-full rounded-2xl border border-ink/15 bg-paper-deep/60 px-4 py-3 text-[15px] outline-none placeholder:text-ink-soft/50 focus:border-ember/50"
            />
            <button
              type="button"
              disabled={!newTask.trim()}
              onClick={() => void addTaskFromInput()}
              className="shrink-0 rounded-2xl bg-ember px-5 py-3 text-sm font-semibold text-paper transition active:scale-95 disabled:opacity-40"
            >
              入池
            </button>
          </div>
        </div>
      )}
    </Screen>
  )
}
