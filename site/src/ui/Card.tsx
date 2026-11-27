import type { ReactNode } from 'react'

export function Card({
  as: Tag = 'div',
  pad,
  className,
  children,
}: {
  as?: 'div' | 'section' | 'article'
  pad?: 16 | 18 | 20
  className?: string
  children: ReactNode
}) {
  return <Tag className={['card', pad ? `p${pad}` : '', className ?? ''].filter(Boolean).join(' ')}>{children}</Tag>
}
