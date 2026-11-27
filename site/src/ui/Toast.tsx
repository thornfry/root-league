import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export const TOAST_MS = 3200

type Show = (message: string, options?: { bad?: boolean }) => void

const ToastContext = createContext<Show | null>(null)

/** Wrap the app once. `useToast()` then shows one short message at the bottom, for a few seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; bad: boolean; id: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const counter = useRef(0)

  const show = useCallback<Show>((message, options) => {
    clearTimeout(timer.current)
    counter.current += 1
    setCurrent({ message, bad: options?.bad ?? false, id: counter.current })
    timer.current = setTimeout(() => setCurrent(null), TOAST_MS)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const value = useMemo(() => show, [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite">
        {current ? (
          <div key={current.id} className={current.bad ? 'toast bad' : 'toast'}>
            {current.message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): Show {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast needs a ToastProvider above it')
  return show
}
