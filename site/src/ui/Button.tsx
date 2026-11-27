import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { Icon, type IconName } from './Icon'

export type ButtonVariant = 'default' | 'pri' | 'danger' | 'discord' | 'ghost' | 'ghost-danger'

interface Look {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  icon?: IconName
}

function classes({ variant = 'default', size = 'md' }: Look, extra?: string) {
  const v = variant === 'default' ? '' : variant === 'ghost-danger' ? 'ghost danger' : variant
  return ['btn', v, size === 'sm' ? 'sm' : '', extra ?? ''].filter(Boolean).join(' ')
}

/** A real button. It is `type="button"` unless told otherwise, and disabled means natively disabled. */
export function Button({
  variant,
  size,
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: Look & ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type={type} className={classes({ variant, size }, className)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  )
}

/** A link that looks like a button, for navigation. */
export function ButtonLink({
  variant,
  size,
  icon,
  className,
  children,
  ...rest
}: Look & LinkProps & { children: ReactNode }) {
  return (
    <Link className={classes({ variant, size }, className)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </Link>
  )
}
