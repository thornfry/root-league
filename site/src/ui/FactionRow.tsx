import type { ReactNode } from 'react'
import { findFaction } from '../data/factions'
import { Card, FactionSeal, SEALS, Tag, type FactionCode } from './index'

/** Shared faction identity and source link; unknown stored codes remain visible for repair. */
export function FactionRow({ code, rank, flagged, children }: {
  code: string; rank?: number; flagged?: boolean; children?: ReactNode
}) {
  const faction = findFaction(code)
  return <Card pad={16} className="stack8">
    <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
      {rank !== undefined && <span className="num" style={{ fontSize: 30 }}>{rank}</span>}
      {faction && faction.code in SEALS && <FactionSeal code={faction.code as FactionCode} />}
      <strong style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{faction?.name ?? code}</strong>
    </div>
    <div className="row">
      {faction && <><Tag tone={faction.type === 'Militant' ? 'mil' : 'ins'}>{faction.type}</Tag><span>Reach {faction.reach}</span>
        <a href={faction.infoUrl} target="_blank" rel="noopener noreferrer" aria-label={`About ${faction.name} (opens in a new tab)`}>Faction info</a></>}
      {flagged && <Tag tone="warn">Outside the season pool</Tag>}
    </div>
    {children && <div className="row">{children}</div>}
  </Card>
}
