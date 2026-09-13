import { useState } from 'react'
import type { Anchor } from '../db'
import { DELIVERABLE_TEMPLATES } from '../copy'
import { Chip, PrimaryButton, Screen } from './ui'

const STEPS = [
  {
    title: '闹钟响过了？',
    desc: '双脚落地，别按稍后提醒。手机留在客厅更好。',
    btn: '起了',
  },
  {
    title: '光和水',
    desc: '拉开窗帘，喝一杯水。这 60 分钟不打开信息流。',
    btn: '做了',
  },
  {
    title: '动一动',
    desc: '拉伸、深蹲、原地走。3 分钟就够，让身体醒过来。',
    btn: '做了',
  },
]

/**
 * 晨间启动：3 步身体唤醒 + 写下今天唯一的 MIT。
 * compressed = 30 秒压缩版（错过早晨时，永不责备）。
 * relay = 昨夜排好的锚点：MIT 预填，只确认或微调。
 */
export default function MorningRitual({
  compressed,
  relay,
  onComplete,
}: {
  compressed: boolean
  relay: Anchor | null
  onComplete: (mit: string) => void
}) {
  const [step, setStep] = useState(compressed ? 3 : 0)
  const [mit, setMit] = useState(relay?.nextStep ?? '')

  if (step < STEPS.length) {
    const s = STEPS[step]
    return (
      <Screen>
        <p className="text-sm text-ink-soft">
          晨间启动 · {step + 1}/{STEPS.length + 1}
        </p>
        <h1 className="mt-6 font-display text-4xl leading-snug">{s.title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">{s.desc}</p>
        <div className="mt-auto pb-4">
          <PrimaryButton onClick={() => setStep(step + 1)}>{s.btn}</PrimaryButton>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <p className="text-sm text-ink-soft">{compressed ? '从现在开始' : '晨间启动 · 最后一步'}</p>
      <h1 className="mt-6 font-display text-4xl leading-snug">今天只做一件事</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
        {compressed
          ? '错过早晨仪式？不算事。30 秒，写下今天的 MIT。'
          : 'MIT 只写一个。它必须是一个看得见的成果——能截图、能提交、能被别人看到。'}
      </p>
      {relay && (
        <div className="mt-4 rounded-2xl bg-paper-deep px-4 py-3 text-sm leading-relaxed text-ink-soft">
          <p>昨夜排好的：{relay.startTime} 开始。</p>
          {relay.ifThen && <p className="mt-1">如果想拖延：{relay.ifThen}</p>}
        </div>
      )}
      <textarea
        value={mit}
        onChange={(e) => setMit(e.target.value)}
        rows={3}
        placeholder="例如：写完「重启系统」第一段的 200 字草稿"
        className="mt-5 w-full resize-none rounded-2xl border border-ink/15 bg-white/50 px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-ink-soft/50 focus:border-ember/50"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {DELIVERABLE_TEMPLATES.map((t) => (
          <Chip key={t} onClick={() => setMit(t)}>
            {t}
          </Chip>
        ))}
      </div>
      <div className="mt-auto pb-4 pt-6">
        <PrimaryButton disabled={!mit.trim()} onClick={() => onComplete(mit.trim())}>
          就它了
        </PrimaryButton>
      </div>
    </Screen>
  )
}
