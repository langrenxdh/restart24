import { useState } from 'react'
import { noticeGranted, noticeSupported } from '../notify'

const LS_KEY = 'r24.install-guide-dismissed'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** 安装引导：添加到主屏 + 系统闹钟兜底建议 + 开启应用内提醒（可关闭） */
export default function InstallGuide() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(LS_KEY) === '1')
  const [granted, setGranted] = useState(() => noticeGranted())
  const supported = noticeSupported()

  if (dismissed || isStandalone()) return null

  function dismiss() {
    localStorage.setItem(LS_KEY, '1')
    setDismissed(true)
  }

  async function enableNotice() {
    if (!supported) return
    const p = await Notification.requestPermission()
    setGranted(p === 'granted')
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

  return (
    <div className="mb-4 rounded-2xl border border-ink/10 bg-white/50 px-5 py-4">
      <p className="text-sm font-medium">把它装到主屏</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        {isIOS ? 'Safari 分享 → 添加到主屏幕' : '浏览器菜单 → 安装应用'}。装完全屏运行、离线可用，明天打开只要 1 秒。
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        晨间提醒建议再配一个系统闹钟——比任何推送都可靠。
      </p>
      <div className="mt-3 flex items-center gap-4 text-sm">
        {granted ? (
          <span className="text-moss">提醒已开启</span>
        ) : supported ? (
          <button
            type="button"
            onClick={() => void enableNotice()}
            className="text-ember underline underline-offset-4"
          >
            开启应用内提醒
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="ml-auto text-ink-soft/70 underline underline-offset-4"
        >
          知道了
        </button>
      </div>
    </div>
  )
}
