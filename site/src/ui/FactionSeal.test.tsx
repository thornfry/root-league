import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { FactionSeal } from './FactionSeal'
import { SEALS } from './seals'

describe('FactionSeal', () => {
  it('shows the two letters on a coloured class', () => {
    const { container } = render(<FactionSeal code="cats" />)
    expect(container.firstElementChild).toHaveClass('seal', 'cats')
    expect(container.firstElementChild).toHaveTextContent('CA')
  })

  it('has a large size', () => {
    const { container } = render(<FactionSeal code="WA" size="lg" />)
    expect(container.firstElementChild).toHaveClass('seal', 'lg2', 'WA')
  })

  it('is hidden from screen readers without a name, because the name sits beside it', () => {
    const { container } = render(<FactionSeal code="rats" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('is an image with the faction name when given one', () => {
    render(<FactionSeal code="rats" name="Lord of the Hundreds" />)
    expect(screen.getByRole('img', { name: 'Lord of the Hundreds' })).toHaveTextContent('LH')
  })

  it('has two letters for each of the 13 factions', () => {
    const letters = Object.values(SEALS)
    expect(letters).toHaveLength(13)
    for (const l of letters) expect(l).toMatch(/^[A-Z]{2}$/)
  })
})
