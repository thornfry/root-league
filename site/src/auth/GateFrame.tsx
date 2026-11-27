import type { ReactNode } from 'react'
import '../ui/styles.css'
import './gate.css'
import { Button } from '../ui/Button'
import { ToastProvider } from '../ui/Toast'

/** The header band and page frame for pages shown before anyone is let in. Sign out appears only when asked for. */
export function GateFrame({ children, onSignOut }: { children: ReactNode; onSignOut?: () => void }) {
  return (
    <ToastProvider>
      <div className="lg">
        <a className="sr" href="#main">
          Skip to content
        </a>
        <header className="band">
          <div className="gate-bar">
            <span className="brand">
              Root <i>League</i>
            </span>
            {onSignOut ? (
              <Button size="sm" className="band-btn" onClick={onSignOut}>
                Sign out
              </Button>
            ) : null}
          </div>
        </header>
        {children}
      </div>
    </ToastProvider>
  )
}
