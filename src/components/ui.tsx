import type { ReactNode } from 'react'

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl bg-ember px-6 py-4 text-lg font-semibold text-paper shadow-sm transition active:scale-[0.98] disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl border border-ink/15 px-6 py-3.5 text-base text-ink-soft transition active:scale-[0.98] disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function Chip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-ink/15 bg-paper-deep px-3.5 py-1.5 text-sm text-ink-soft transition active:scale-95"
    >
      {children}
    </button>
  )
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col">{children}</div>
}
