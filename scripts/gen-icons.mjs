#!/usr/bin/env node
/**
 * 生成 PWA 图标（零外部依赖）：纸底 + 赭橙圆 + 白色「24」。
 * 输出到 public/icons/：icon-192/512、maskable 两档、apple-touch-icon。
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// ---------- PNG 编码 ----------
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---------- 绘制 ----------
const PAPER = [248, 242, 231]
const EMBER = [192, 95, 28]
const WHITE = [255, 253, 248]
const FONT = {
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
}
const COLS = 11 // 5 列「2」+ 1 列间隔 + 5 列「4」
const ROWS = 7

function drawIcon(size, { rounded = true, circleScale = 1 }) {
  const SS = 4 // 超采样倍数
  const W = size * SS
  const rSum = new Float64Array(W * W)
  const gSum = new Float64Array(W * W)
  const bSum = new Float64Array(W * W)
  const aSum = new Float64Array(W * W)
  const R = rounded ? 0.223 * W : 0
  const cr = 0.36 * circleScale * W
  const cx = W / 2
  const cy = W / 2
  const cell = (1.3 * cr) / COLS
  const bx = cx - (COLS * cell) / 2
  const by = cy - (ROWS * cell) / 2

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      // 圆角矩形包含测试（四角之外的采样跳过）
      if (R > 0) {
        const rx = Math.min(x, W - 1 - x)
        const ry = Math.min(y, W - 1 - y)
        if (rx < R && ry < R) {
          const dx = R - rx
          const dy = R - ry
          if (dx * dx + dy * dy > R * R) continue
        }
      }
      let col = PAPER
      if ((x - cx) ** 2 + (y - cy) ** 2 <= cr * cr) col = EMBER
      const gx = x - bx
      const gy = y - by
      if (gx >= 0 && gy >= 0 && gx < COLS * cell && gy < ROWS * cell) {
        const colIdx = Math.floor(gx / cell)
        const rowIdx = Math.floor(gy / cell)
        let on = false
        if (colIdx <= 4) on = FONT['2'][rowIdx][colIdx] === '1'
        else if (colIdx >= 6) on = FONT['4'][rowIdx][colIdx - 6] === '1'
        if (on) col = WHITE
      }
      const i = y * W + x
      rSum[i] += col[0]
      gSum[i] += col[1]
      bSum[i] += col[2]
      aSum[i] += 1
    }
  }

  // 盒式下采样
  const rgba = Buffer.alloc(size * size * 4)
  const n = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = (y * SS + sy) * W + (x * SS + sx)
          r += rSum[i]
          g += gSum[i]
          b += bSum[i]
          a += aSum[i]
        }
      }
      const o = (y * size + x) * 4
      rgba[o] = a > 0 ? Math.round(r / a) : 0
      rgba[o + 1] = a > 0 ? Math.round(g / a) : 0
      rgba[o + 2] = a > 0 ? Math.round(b / a) : 0
      rgba[o + 3] = Math.round((a / n) * 255)
    }
  }
  return encodePNG(size, rgba)
}

const files = [
  ['icon-192.png', drawIcon(192, { rounded: true })],
  ['icon-512.png', drawIcon(512, { rounded: true })],
  ['icon-maskable-192.png', drawIcon(192, { rounded: false, circleScale: 0.8 })],
  ['icon-maskable-512.png', drawIcon(512, { rounded: false, circleScale: 0.8 })],
  ['apple-touch-icon.png', drawIcon(180, { rounded: false })],
]
for (const [name, buf] of files) {
  writeFileSync(join(outDir, name), buf)
  console.log(`${name}  ${buf.length} bytes`)
}
