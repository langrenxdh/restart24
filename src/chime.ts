/**
 * 计时结束的柔和钟声（Web Audio 合成，无音频资源）。
 * iOS Safari 对非手势创建的 AudioContext 默认 suspended 且不 resume 就永远无声（评审 #7）——
 * 所以开始计时的手势里先 warmChime() 预热共享 context，播放时再兜底 resume。
 */
let shared: AudioContext | null = null

function getCtx(): typeof AudioContext | undefined {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  )
}

/** 在用户手势里调用：创建/唤醒共享 AudioContext */
export function warmChime(): void {
  try {
    const Ctx = getCtx()
    if (!Ctx) return
    if (!shared || shared.state === 'closed') shared = new Ctx()
    if (shared.state === 'suspended') void shared.resume()
  } catch {
    // 无音频权限时静默
  }
}

export function playChime(): void {
  try {
    const Ctx = getCtx()
    if (!Ctx) return
    if (!shared || shared.state === 'closed') shared = new Ctx()
    if (shared.state === 'suspended') void shared.resume()
    const ctx = shared
    const now = ctx.currentTime
    ;[523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.18
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 1.2)
    })
  } catch {
    // 无音频权限时静默
  }
}
