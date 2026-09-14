// 用无头 Chrome 给应用截图（走 CDP，等真实渲染完成，兼容 IndexedDB 异步加载）。
//
// 用法：
//   node scripts/screenshot.mjs <url> <输出路径> [--width 390] [--height 844] [--wait 4500]
//
// 示例：
//   node scripts/screenshot.mjs http://localhost:4173/ docs/screenshot-home.png
//
// 依赖：本机安装了 Google Chrome（/Applications/Google Chrome.app）。Node 22+（内置 WebSocket）。
import { writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const url = args[0]
const out = args[1]
if (!url || !out) {
  console.error('用法: node scripts/screenshot.mjs <url> <输出路径> [--width N] [--height N] [--wait ms]')
  process.exit(1)
}
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : dflt
}
const width = flag('width', 390)
const height = flag('height', 844)
const wait = flag('wait', 4500)

const CHROME =
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : '/usr/bin/google-chrome'
const port = 9300 + Math.floor(Math.random() * 200)
const profile = `/tmp/restart24-shot-${port}`

const proc = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
)
await new Promise((r) => setTimeout(r, 1500))

try {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  }
  const send = (method, params = {}) =>
    new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })) })

  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url })
  await new Promise((r) => setTimeout(r, wait))
  const result = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(out, Buffer.from(result.result.data, 'base64'))
  console.log(`${out} ✓ (${width}x${height} @2x)`)
  ws.close()
} finally {
  proc.kill()
}
