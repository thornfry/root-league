import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Alert, type AlertTone } from './Alert'

describe('Alert', () => {
  it.each(['warn', 'bad', 'ok', 'info'] as AlertTone[])('shows the %s tone with an icon and its text', (tone) => {
    render(<Alert tone={tone}>Names the rule</Alert>)
    const text = screen.getByText('Names the rule')
    const box = text.closest('.alert')!
    expect(box).toHaveClass('alert', tone)
    expect(box.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('announces an error but not the other tones', () => {
    const { rerender } = render(<Alert tone="bad">Row 3, column discord_id</Alert>)
    expect(screen.getByRole('alert')).toHaveTextContent('Row 3, column discord_id')
    rerender(<Alert tone="warn">Heads up</Alert>)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('takes a different icon', () => {
    const { container } = render(
      <Alert tone="info" icon="lock">
        Lists are locked
      </Alert>,
    )
    expect(container.querySelector('path')?.getAttribute('d')).toBe('M4.5 7V5.5a3.5 3.5 0 017 0V7 M3.5 7h9v7h-9z')
  })
})
