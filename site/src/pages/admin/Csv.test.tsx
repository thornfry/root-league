import '@testing-library/jest-dom/vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { adminJson, makeFakeDb } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'
const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))
vi.mock('../../csv/api', async importOriginal => ({ ...await importOriginal<object>(), readFiles: async () => ({ 'season.csv': { columns: ['id'], rows: [{ id: 's' }] } }) }))
function setup(count: number, error = '') {
  const fake = makeFakeDb({ whoami: adminJson() }); const base = fake.rpc.getMockImplementation()!
  const rpc = vi.fn(async (name: string, ...args: unknown[]) => {
    void args
    if (name !== 'import_league_state') return base(name)
    if (error) return { data: null, error: { message: error } }
    return { data: { total_changes: count, changes: [], warnings: [], ignored: [] }, error: null }
  })
  const chain: Record<string, unknown> = {}
  for (const name of ['select', 'eq']) chain[name] = () => chain
  chain.maybeSingle = async () => ({ data: { id: 's', started_at: '2026-01-01' }, error: null })
  h.db = { ...fake.db, rpc, from: () => chain }
  renderApp('/admin/csv')
  return { ...fake, rpc }
}
async function preview() {
  const input = await screen.findByLabelText('Choose the .csv files, or the zip')
  await waitFor(() => expect(input).toBeEnabled())
  fireEvent.change(input, { target: { files: [new File(['id\ns'], 'season.csv')] } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview changes' }))
}
it('previews without committing, warns after start and confirms once', async () => {
  const fake = setup(1); await preview()
  await screen.findByText('Preview: 1 changes')
  expect(screen.getByText(/The season has started/)).toBeVisible()
  const calls = () => fake.rpc.mock.calls.filter(([name]) => name === 'import_league_state')
  expect(calls()).toHaveLength(1)
  expect(calls()[0]?.[1]).toMatchObject({ p_preview: true })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
  await screen.findByText('Imported 1 changes.')
  expect(calls()).toHaveLength(2)
  expect(calls()[1]?.[1]).toMatchObject({ p_preview: false })
})
it('disables confirmation for unchanged data', async () => {
  const fake = setup(0); await preview(); await screen.findByText('Preview: 0 changes')
  expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
  expect(fake.rpc.mock.calls.filter(([name]) => name === 'import_league_state')).toHaveLength(1)
})
it('shows server file, row and column errors and offers no confirmation', async () => {
  setup(0, 'season.csv, row 2, column capacity: invalid integer'); await preview()
  expect(await screen.findByText(/Nothing imported.*season.csv/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument()
})
