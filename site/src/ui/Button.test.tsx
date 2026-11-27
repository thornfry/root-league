import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Button, ButtonLink } from './Button'

describe('Button', () => {
  it('is a real button that does not submit by default', () => {
    render(<Button>Save list</Button>)
    const b = screen.getByRole('button', { name: 'Save list' })
    expect(b).toHaveAttribute('type', 'button')
    expect(b).toHaveClass('btn')
  })

  it.each([
    ['pri', 'btn pri'],
    ['danger', 'btn danger'],
    ['discord', 'btn discord'],
    ['ghost', 'btn ghost'],
    ['ghost-danger', 'btn ghost danger'],
    ['default', 'btn'],
  ] as const)('maps the %s variant to its canvas class', (variant, cls) => {
    render(<Button variant={variant}>Go</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('class', cls)
  })

  it('has a small size', () => {
    render(<Button size="sm">Go</Button>)
    expect(screen.getByRole('button')).toHaveClass('sm')
  })

  it('calls onClick when enabled and not when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Go</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    )
    expect(screen.getByRole('button')).toBeDisabled()
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows an icon beside the label, hidden from screen readers', () => {
    render(<Button icon="arrow">Reload</Button>)
    expect(screen.getByRole('button', { name: 'Reload' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('ButtonLink', () => {
  it('is a link that looks like a button', () => {
    const router = createMemoryRouter([{ path: '/', element: <ButtonLink to="/players" variant="pri">Players</ButtonLink> }])
    render(<RouterProvider router={router} />)
    const a = screen.getByRole('link', { name: 'Players' })
    expect(a).toHaveAttribute('href', '/players')
    expect(a).toHaveClass('btn', 'pri')
  })
})
