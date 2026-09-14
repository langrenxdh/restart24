import { useState } from 'react'
import type { DayRecord } from '../lib/types'
import { dateLabel } from '../lib/dates'
import { GhostButton, PrimaryButton, Screen } from './ui'

/** 记录交付物：首个锁定胜利，append = 赢后追加成果 */
export default function DeliverableLog({
  day,
  initial,
  append = false,
  onSave,
  onCancel,
}: {
  day: DayRecord
  initial: string
  append?: boolean
  onSave: (text: string, proofUrl: string) => Promise<void>
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const [proofUrl, setProofUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (saving || !text.trim()) return
    setSaving(true) // 防连点：保存中不可重复提交
    setError(null)
    try {
      await onSave(text.trim(), proofUrl.trim())
    } catch {
      setError('没存进去——存储可能不可用或已满。数据没有丢失，再试一次。')
      setSaving(false)
    }
  }

  return (
    <Screen>
      <p className="text-sm text-ink-soft">{dateLabel(day.date)}</p>
      <h1 className="mt-6 font-display text-4xl leading-snug">{append ? '追加一个成果' : '今天做成了什么？'}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
        {append ? '胜利已锁定，写下的每一个都算复利。' : '写下来，给大脑发一次胜利信号。10 分钟的版本也算。'}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={200}
        placeholder="今天完成的可见成果…"
        className="mt-5 w-full resize-none rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-ink-soft/50 focus:border-ember/50"
      />
      <input
        value={proofUrl}
        onChange={(e) => setProofUrl(e.target.value)}
        maxLength={500}
        placeholder="成果链接（https://…，可选）"
        className="mt-3 w-full rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] outline-none placeholder:text-ink-soft/50 focus:border-ember/50"
      />
      {error && <p className="mt-3 text-sm text-ember">{error}</p>}
      <div className="mt-auto space-y-3 pb-4 pt-6">
        <PrimaryButton disabled={saving || !text.trim()} onClick={() => void submit()}>
          {saving ? '记录中…' : append ? '记下这个成果' : '记下，今天赢了'}
        </PrimaryButton>
        <GhostButton onClick={onCancel}>返回</GhostButton>
      </div>
    </Screen>
  )
}
