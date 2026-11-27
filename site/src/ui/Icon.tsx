/** Stroke icons from the design canvas, drawn on a 16 by 16 grid. Decorative: the words carry the meaning. */
export const ICON_PATHS = {
  check: 'M3 8.5l3.2 3.2L13 4.8',
  plus: 'M8 3v10M3 8h10',
  arrow: 'M3 8h10 M9 4l4 4-4 4',
  warn: 'M8 2.2l6.2 11H1.8z M8 6.8v3 M8 11.9v.2',
  copy: 'M5 5h8v8H5z M3 11V3h8',
  lock: 'M4.5 7V5.5a3.5 3.5 0 017 0V7 M3.5 7h9v7h-9z',
  menu: 'M2.5 4.5h11 M2.5 8h11 M2.5 11.5h11',
  close: 'M4 4l8 8M12 4l-8 8',
  up: 'M8 13V3 M4 7l4-4 4 4',
  down: 'M8 3v10 M4 9l4 4 4-4',
  info: 'M8 7v4 M8 4.6v.2 M8 1.8a6.2 6.2 0 100 12.4A6.2 6.2 0 008 1.8z',
  x: 'M4 4l8 8M12 4l-8 8',
  clock: 'M8 2a6 6 0 100 12A6 6 0 008 2z M8 5v3.2l2 1.3',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z M8 6.2a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6',
} as const

export type IconName = keyof typeof ICON_PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}
