import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

/**
 * Service Worker 更新策略（评审 #12）：autoUpdate 下新 SW 会 skipWaiting 接管，
 * 但长驻标签页仍在跑旧 JS——所以每小时主动查一次更新，controllerchange 时刷新一次。
 * 刷新对计时器安全：会话基于时间戳落库，重载后自动恢复。
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return
      window.setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000)
    })
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
