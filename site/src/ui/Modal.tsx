import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A dialog over a dimmed backdrop: a bottom sheet on phones, centred on desktop. Escape and a click on
 * the backdrop close it, Tab stays inside it, and focus returns to what had it before it opened.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  actions,
}: {
  open: boolean
  title: string
  onClose: () => void
  children?: ReactNode
  actions?: ReactNode
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    const el = panel.current
    const first = el?.querySelector<HTMLElement>('input, textarea, select') ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !el) return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const a = items[0]!
      const z = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="lg modalbk" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className="disp h2">
          {title}
        </h2>
        {children ? <div>{children}</div> : null}
        {actions ? <div className="row">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

/** A yes or no question: a confirm button and Cancel. `danger` styles the confirm button as destructive. */
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = 'OK',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button variant={danger ? 'danger' : 'pri'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
