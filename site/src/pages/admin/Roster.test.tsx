import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { adminJson, makeFakeDb, viewerJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'
import type { Db } from '../../db/client'

const client = vi.hoisted(() => ({ db: null as unknown as Db }))
vi.mock('../../db/client', () => ({ isConfigured: () => true, getSupabase: () => client.db }))
let stage: string
let capacity: number
let rows: ReturnType<typeof makeRow>[]
let rpc: ReturnType<typeof vi.fn>
function makeRow(person_id: string, list: string, position: number) {
  return { person_id, display_name: person_id, list, position, season_id: 'season', ranked_factions: ['cats', 'birds'], list_in: true, list_flagged: false }
}
function setup(admin = true) {
  const fake = makeFakeDb({ whoami: admin ? adminJson() : viewerJson() })
  const authRpc = fake.rpc
  rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (!name.startsWith('roster_')) return authRpc(name)
    if (name === 'roster_add') rows.push(makeRow(String(args.p_display_name), 'waitlist', rows.length + 1))
    if (name === 'roster_remove') rows = rows.filter((r) => r.person_id !== args.p_person_id)
    if (name === 'roster_move') {
      const r = rows.find((r) => r.person_id === args.p_person_id)!
      r.list = String(args.p_to_list)
      r.position = Number(args.p_to_position ?? rows.length + 1)
    }
    if (name === 'roster_swap') {
      const a = rows.find((r) => r.person_id === args.p_person_a)!
      const b = rows.find((r) => r.person_id === args.p_person_b)!
      ;[a.list, b.list] = [b.list, a.list]
    }
    return { data: null, error: null }
  })
  const from = vi.fn((table: string) => {
    const value = () => {
      if (table === 'seasons') return { id: 'season', capacity }
      if (table === 'season_stage') return { stage }
      if (table === 'roster_public') return rows.map((r) => ({ ...r })).sort((a, b) => a.position - b.position)
      return []
    }
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain), maybeSingle: () => chain, single: () => chain, then: (resolve: (value: unknown) => void) => Promise.resolve({ data: value(), error: null }).then(resolve) }
    return chain
  })
  client.db = { ...fake.db, rpc, from } as unknown as Db
  return from
}
beforeEach(() => { stage = 'open'; capacity = 8; rows = [makeRow('Alice', 'league', 1), makeRow('Bob', 'waitlist', 1), makeRow('Carol', 'waitlist', 2)] })

describe('Roster', () => {
  it('moves using only the keyboard and persists waitlist ordering', async () => {
    setup(); renderApp('/admin/roster', 375)
    expect(await screen.findByText(/7 places are open/)).toBeVisible()
    const move = await screen.findByRole('button', { name: 'Move Alice to waitlist' })
    move.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('roster_move', { p_season_id: 'season', p_person_id: 'Alice', p_to_list: 'waitlist' }))
    await screen.findByText('Alice moved to the waitlist.')
    await userEvent.click(screen.getByRole('button', { name: 'Move Carol up the waitlist' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('roster_move', { p_season_id: 'season', p_person_id: 'Carol', p_to_list: 'waitlist', p_to_position: 1 }))
  }, 15_000)
  it('refuses a full league and offers a single atomic swap', async () => {
    capacity = 1; setup(); renderApp('/admin/roster')
    await userEvent.click(await screen.findByRole('button', { name: 'Move Bob to league list' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Move someone off first')
    expect(rpc.mock.calls.filter(([name]) => name === 'roster_move')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Swap Bob in' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('roster_swap', { p_season_id: 'season', p_person_a: 'Bob', p_person_b: 'Alice' }))
    await screen.findByText('Bob swapped into the league list.')
  }, 15_000)
  it('adds by name and confirms the ranked list is deleted before removal', async () => {
    setup(); renderApp('/admin/roster')
    await userEvent.type(await screen.findByLabelText('Name'), 'Dana')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText('Dana added to the waitlist.')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Alice' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('deletes their ranked list of 2 factions')
    expect(rpc.mock.calls.filter(([name]) => name === 'roster_remove')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Alice' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove from roster' }))
    await screen.findByText('Alice removed from the roster.')
  }, 15_000)
  it('disables every roster action when live', async () => {
    stage = 'live'; setup(); renderApp('/admin/roster')
    await screen.findByText(/The season has started/)
    for (const button of screen.getAllByRole('button').filter((b) => /^(Drag|Move |Remove |To |Up$|Down$|Add$)/.test(b.textContent ?? '') || b.getAttribute('aria-label')?.startsWith('Move '))) expect(button).toBeDisabled()
    expect(screen.getByLabelText('Name')).toBeDisabled()
  }, 15_000)
  it('keeps Locked editable and reports a rejected write without moving a row', async () => {
    stage = 'locked'; setup(); renderApp('/admin/roster')
    const button = await screen.findByRole('button', { name: 'Move Bob to league list' })
    expect(button).toBeEnabled()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'The league list is full. Move someone off first.' } })
    await userEvent.click(button)
    await screen.findByRole('alert')
    expect(within(screen.getByRole('list', { name: 'Waitlist' })).getByText('Bob')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Move someone off first')
  }, 15_000)
  it('blocks players from loading admin roster data', async () => {
    const from = setup(false); renderApp('/admin/roster')
    await screen.findByRole('heading', { name: 'Home' })
    // The shell and Home may read membership, but the admin loader must stay blocked.
    expect(from.mock.calls.map(([table]) => table)).toEqual(expect.arrayContaining(['roster_public']))
    for (const [index, [table]] of from.mock.calls.entries()) {
      expect(['seasons', 'season_stage', 'roster_public']).toContain(table)
      const query = from.mock.results[index]!.value
      if (table === 'roster_public') {
        expect(query.select).toHaveBeenCalledWith('person_id, list_in, list_flagged, ranked_factions')
        expect(query.eq).toHaveBeenCalledWith('season_id', 'season')
        expect(query.eq).toHaveBeenCalledWith('is_me', true)
        expect(query.order).not.toHaveBeenCalled()
      }
    }
    expect(rpc.mock.calls.filter(([name]) => name.startsWith('roster_'))).toHaveLength(0)
  }, 15_000)
})
