/** 计时结束的柔和钟声（Web Audio 合成，无音频资源） */
export function playChime(): void {
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
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
    setTimeout(() => void ctx.close(), 2500)
  } catch {
    // 无音频权限时静默
  }
}
