import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type AlertTone = 'warn' | 'bad' | 'ok' | 'info'

const DEFAULT_ICON: Record<AlertTone, IconName> = { warn: 'warn', bad: 'x', ok: 'check', info: 'info' }

/** A message with an icon. Errors are announced at once; the others are plain content. */
export function Alert({ tone, icon, children }: { tone: AlertTone; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon name={icon ?? DEFAULT_ICON[tone]} size={18} />
      <div>{children}</div>
    </div>
  )
}
