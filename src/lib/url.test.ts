import { describe, expect, it } from 'vitest'
import { sanitizeProofUrl } from './url'

describe('sanitizeProofUrl 协议白名单', () => {
  it('放行 http/https', () => {
    expect(sanitizeProofUrl('https://example.com/proof')).toBe('https://example.com/proof')
    expect(sanitizeProofUrl('HTTP://example.com')).toBe('HTTP://example.com')
  })
  it('拦截 data:/javascript:/其他协议与空值', () => {
    expect(sanitizeProofUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(sanitizeProofUrl('javascript:alert(1)')).toBeUndefined()
    expect(sanitizeProofUrl('file:///etc/passwd')).toBeUndefined()
    expect(sanitizeProofUrl('')).toBeUndefined()
    expect(sanitizeProofUrl(undefined)).toBeUndefined()
    expect(sanitizeProofUrl('  ')).toBeUndefined()
  })
  it('首尾空白清理后放行', () => {
    expect(sanitizeProofUrl('  https://a.b  ')).toBe('https://a.b')
  })
})
