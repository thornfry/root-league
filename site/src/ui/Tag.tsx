import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type TagTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'mil' | 'ins' | 'solid' | 'adm'

/** A status label. It always carries a word, never colour alone; the icon is optional. */
export function Tag({ tone = 'neutral', icon, children }: { tone?: TagTone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={tone === 'neutral' ? 'tag' : `tag ${tone}`}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  )
}
