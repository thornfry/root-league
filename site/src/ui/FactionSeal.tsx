import { SEALS, type FactionCode } from './seals'

/**
 * A colour seal with the faction's two letters. Colour is identity only: the name is always
 * written beside it, so the seal is hidden from screen readers unless a name is passed.
 */
export function FactionSeal({ code, size = 'md', name }: { code: FactionCode; size?: 'md' | 'lg'; name?: string }) {
  const cls = `seal ${size === 'lg' ? 'lg2 ' : ''}${code}`
  return name ? (
    <span className={cls} role="img" aria-label={name}>
      {SEALS[code]}
    </span>
  ) : (
    <span className={cls} aria-hidden="true">
      {SEALS[code]}
    </span>
  )
}
