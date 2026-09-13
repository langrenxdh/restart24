/** 页面通知：桌面与 Android 尽力而为；iOS 网页通知限制严格，晨间提醒靠系统闹钟兜底 */
export function notify(title: string, body: string): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.png', tag: 'restart24' })
    }
  } catch {
    // 平台不支持页面通知时静默
  }
}

export function noticeSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function noticeGranted(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}
