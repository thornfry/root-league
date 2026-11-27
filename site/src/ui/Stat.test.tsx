import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Stat } from './Stat'

describe('Stat', () => {
  it('shows a number and its label', () => {
    render(<Stat value="12" label="Players" />)
    expect(screen.getByText('12')).toHaveClass('num')
    expect(screen.getByText('Players')).toHaveClass('kicker')
  })

  it('shows a line under it when given one', () => {
    render(<Stat value="10 of 12" label="League list" sub="2 places open" />)
    expect(screen.getByText('2 places open')).toBeInTheDocument()
  })

  it('has no extra line without one', () => {
    const { container } = render(<Stat value="3" label="Left" />)
    expect(container.querySelector('.sub')).toBeNull()
  })
})
