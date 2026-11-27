import type { ReactNode } from 'react'
import { FactionSeal } from './FactionSeal'
import type { FactionCode } from './seals'
import { Icon } from './Icon'

/**
 * One player at a table: the faction badge, then the name, then a crown if they won. The faction
 * name is on the badge for screen readers and on hover, not written out. With onPick it is a
 * button for Pick'ems; pick marks go in children as tags.
 */
export function SeatCell({ name, faction, factionName, winner = false, you = false, pick = null, onPick, disabled = false, children }: {
  name: string
  faction: FactionCode
  factionName: string
  winner?: boolean
  you?: boolean
  /** 1 for a first pick, 2 for a second pick. */
  pick?: 1 | 2 | null
  onPick?: () => void
  disabled?: boolean
  children?: ReactNode
}) {
  const cls = `pc${winner ? ' win' : ''}${pick ? ` p${pick}` : ''}${onPick ? ' pk' : ''}`
  const inner = <>
    <span className="pn">
      <span className="seal-wrap" title={factionName}><FactionSeal code={faction} name={factionName} /></span>
      <span className="nm">{name}</span>
      {you ? <span className="tag solid">You</span> : null}
      {winner ? <span className="wn"><Icon name="crown" size={18} /><span className="sr-only">Winner</span></span> : null}
    </span>
    {children ? <span className="ptags">{children}</span> : null}
  </>
  return onPick
    ? <button type="button" className={cls} aria-pressed={pick !== null} disabled={disabled} onClick={onPick}>{inner}</button>
    : <div className={cls}>{inner}</div>
}
