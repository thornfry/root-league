import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('wraps its children in a card', () => {
    render(<Card>Inside</Card>)
    expect(screen.getByText('Inside')).toHaveAttribute('class', 'card')
  })

  it('has padding steps and can be another element', () => {
    render(
      <Card as="section" pad={20}>
        Padded
      </Card>,
    )
    const el = screen.getByText('Padded')
    expect(el.tagName).toBe('SECTION')
    expect(el).toHaveClass('card', 'p20')
  })
})
