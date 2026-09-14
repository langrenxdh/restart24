/**
 * proofUrl 协议白名单：只放行 http/https。
 * React 只拦截 javascript:，data:text/html 之类的注入会原样渲染成可点链接（评审 #3）。
 * 入库前过滤 + 渲染处兜底都调用这里。
 */
export function sanitizeProofUrl(url: string | undefined): string | undefined {
  const trimmed = (url ?? '').trim()
  if (!trimmed) return undefined
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined
}
