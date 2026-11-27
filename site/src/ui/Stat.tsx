import type { ReactNode } from 'react'

/** A big number with a small label, in the condensed face. */
export function Stat({ value, label, sub }: { value: ReactNode; label: string; sub?: string }) {
  return (
    <div className="stat">
      <span className="kicker">{label}</span>
      <span className="num">{value}</span>
      {sub ? <span className="sub">{sub}</span> : null}
    </div>
  )
}
