/** One option in a Segmented control. The count is optional and shown after the label. */
export interface SegmentedOption<T extends string> {
  value: T
  label: string
  count?: number
}

/**
 * A section control: one track of 2 to 5 options that change the list below it. The chosen
 * option is white with an amber underline. It is a group of buttons with aria-pressed, so a
 * screen reader hears which one is on.
 */
export function Segmented<T extends string>({ options, value, onChange, label, fit = false }: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  /** Size to the content instead of filling the width. */
  fit?: boolean
}) {
  return (
    <div className={fit ? 'seg fit' : 'seg'} role="group" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          <span>{option.label}</span>
          {option.count === undefined ? null : <>{' '}<span className="n">{option.count}</span></>}
        </button>
      ))}
    </div>
  )
}
