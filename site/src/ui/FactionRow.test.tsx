import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { FACTIONS } from '../data/factions'
import { FactionRow } from './FactionRow'

it.each(FACTIONS)('shows $name metadata and its canonical info URL', faction => {
  render(<FactionRow code={faction.code} rank={1} />)
  expect(screen.getByText(faction.name)).toBeInTheDocument()
  expect(screen.getByText(faction.type)).toBeInTheDocument()
  expect(screen.getByText(`Reach ${faction.reach}`)).toBeInTheDocument()
  expect(screen.getByRole('link')).toHaveAttribute('href', faction.infoUrl)
  expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer')
})

it('keeps an unknown stored faction visible for repair', () => {
  render(<FactionRow code="retired-code" flagged />)
  expect(screen.getByText('retired-code')).toBeInTheDocument()
  expect(screen.getByText('Outside the season pool')).toBeInTheDocument()
  expect(screen.queryByRole('link')).toBeNull()
})
