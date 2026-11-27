import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface Common {
  label: string
  hint?: string
  error?: string
}

type InputProps = Common & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>
type AreaProps = Common & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>

/** A labelled input or textarea. The hint and the error are tied to the control for screen readers. */
export function Field(props: InputProps | AreaProps) {
  const id = useId()
  const { label, hint, error, multiline, ...control } = props
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  const shared = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea {...(control as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...shared} />
      ) : (
        <input type="text" {...(control as InputHTMLAttributes<HTMLInputElement>)} {...shared} />
      )}
      {hint ? (
        <span id={hintId} className="hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errId} className="err">
          {error}
        </span>
      ) : null}
    </div>
  )
}
