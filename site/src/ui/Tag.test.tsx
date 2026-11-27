import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Tag, type TagTone } from './Tag'

describe('Tag', () => {
  it('always shows its word', () => {
    render(<Tag tone="ok">Submitted</Tag>)
    expect(screen.getByText('Submitted')).toHaveClass('tag', 'ok')
  })

  it('has the plain style for the neutral tone', () => {
    render(<Tag>Upcoming</Tag>)
    expect(screen.getByText('Upcoming')).toHaveAttribute('class', 'tag')
  })

  it.each(['ok', 'warn', 'bad', 'mil', 'ins', 'solid', 'adm'] as TagTone[])('has the %s tone', (tone) => {
    render(<Tag tone={tone}>Word</Tag>)
    expect(screen.getByText('Word')).toHaveClass('tag', tone)
  })

  it('shows an optional icon that is hidden from screen readers', () => {
    render(
      <Tag tone="warn" icon="warn">
        Disputed
      </Tag>,
    )
    const tag = screen.getByText('Disputed')
    expect(tag.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(tag.textContent).toBe('Disputed')
  })

  it('shows military and insurgent by their words, with the dot and ring left to CSS', () => {
    render(
      <>
        <Tag tone="mil">Militant</Tag>
        <Tag tone="ins">Insurgent</Tag>
      </>,
    )
    expect(screen.getByText('Militant')).toHaveClass('mil')
    expect(screen.getByText('Insurgent')).toHaveClass('ins')
  })
})
