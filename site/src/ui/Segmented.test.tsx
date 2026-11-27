import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { Segmented } from './Segmented'
import { SeatCell } from './SeatCell'

const options = [{ value: 'all', label: 'All', count: 12 }, { value: 'mine', label: 'Mine', count: 4 }]

describe('Segmented', () => {
  it('is a labelled group of buttons that says which is on, with the count in the name', async () => {
    const onChange = vi.fn()
    render(<Segmented label="Filter games" options={options} value="all" onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'Filter games' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All 12' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Mine 4' }))
    expect(onChange).toHaveBeenCalledWith('mine')
  })
})

describe('SeatCell', () => {
  it('puts the faction on the badge, not in the text, and marks a winner with a crown and a word', () => {
    render(<SeatCell name="Kyra" faction="vagabond" factionName="Vagabond" winner you />)
    expect(screen.getByRole('img', { name: 'Vagabond' })).toBeInTheDocument()
    expect(screen.getByText('Kyra')).toBeInTheDocument()
    expect(screen.getByText('Winner')).toBeInTheDocument()
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.queryByText('Vagabond')).not.toBeInTheDocument()
  })
  it('is a pressed button when it takes a pick', async () => {
    const onPick = vi.fn()
    render(<SeatCell name="Kyra" faction="vagabond" factionName="Vagabond" pick={1} onPick={onPick}><span className="tag">1st pick</span></SeatCell>)
    const button = screen.getByRole('button', { name: /Kyra/ })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(button)
    expect(onPick).toHaveBeenCalled()
  })
})
