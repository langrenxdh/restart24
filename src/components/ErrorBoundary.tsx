import { Component, type ReactNode } from 'react'

/** 全局错误边界：任何组件崩溃都不至于白屏，数据在本地不会丢 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <h1 className="font-display text-3xl">出了点问题。</h1>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">
            界面崩了，但数据都在本地，没有丢。点下面重试，或刷新页面。
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-8 rounded-2xl bg-ember px-8 py-3.5 text-base font-semibold text-paper transition active:scale-[0.98]"
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
