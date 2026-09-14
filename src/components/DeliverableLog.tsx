import { useState } from 'react'
import type { DayRecord } from '../db'
import { dateLabel } from '../db'
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
  onSave: (text: string, proofUrl: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const [proofUrl, setProofUrl] = useState('')

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
        placeholder="今天完成的可见成果…"
        className="mt-5 w-full resize-none rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-ink-soft/50 focus:border-ember/50"
      />
      <input
        value={proofUrl}
        onChange={(e) => setProofUrl(e.target.value)}
        placeholder="成果链接或文件位置（可选）"
        className="mt-3 w-full rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] outline-none placeholder:text-ink-soft/50 focus:border-ember/50"
      />
      <div className="mt-auto space-y-3 pb-4 pt-6">
        <PrimaryButton disabled={!text.trim()} onClick={() => onSave(text.trim(), proofUrl.trim())}>
          {append ? '记下这个成果' : '记下，今天赢了'}
        </PrimaryButton>
        <GhostButton onClick={onCancel}>返回</GhostButton>
      </div>
    </Screen>
  )
}
