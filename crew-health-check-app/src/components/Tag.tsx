import type { ReactNode } from 'react'

// Neutral label such as "Simulated data". Never uses status tokens, because a
// tag is not a health status.
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-dashed border-slate-500 bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
      {children}
    </span>
  )
}
