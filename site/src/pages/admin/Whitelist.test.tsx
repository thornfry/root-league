import '@testing-library/jest-dom/vitest'
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { adminJson, makeFakeDb, viewerJson } from '../../test-support/fakeDb'
import { renderApp } from '../../test-support/renderApp'

// Parallel build agents share this machine; allow the real route and auth queries to settle.
configure({ asyncUtilTimeout: 10_000 })
vi.setConfig({ testTimeout: 30_000 })

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../db/client', () => ({ getSupabase: () => h.db, isConfigured: () => true }))

const initial = { discord_id: '100000000000000001', label: 'Will', is_admin: true, added_at: '2026-11-26T12:00:00Z', added_by: null, added_person: { display_name: 'Will' } }
function setup() {
  const fake = makeFakeDb({ whoami: adminJson() })
  let rows = [initial]
  const baseRpc = fake.rpc.getMockImplementation()!
  fake.rpc.mockImplementation(async (name: string, ...args: unknown[]) => {
    const values = args[0] as { p_entries?: { discord_id: string; label: string }[]; p_discord_id?: string; p_label?: string; p_is_admin?: boolean } | undefined
    if (!name.startsWith('whitelist_')) return baseRpc(name)
    if (name === 'whitelist_add_many') rows = [...rows, ...values!.p_entries!.map((entry) => ({ ...initial, ...entry, is_admin: false }))]
    if (name === 'whitelist_label') rows = rows.map((row) => row.discord_id === values?.p_discord_id ? { ...row, label: values.p_label! } : row)
    if (name === 'whitelist_set_admin') rows = rows.map((row) => row.discord_id === values?.p_discord_id ? { ...row, is_admin: values.p_is_admin! } : row)
    if (name === 'whitelist_remove') rows = rows.filter((row) => row.discord_id !== values?.p_discord_id)
    return { data: {}, error: null }
  })
  const order = vi.fn().mockImplementation(() => ({ order: vi.fn(async () => ({ data: rows, error: null })) }))
  h.db = { ...fake.db, from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })) }
  return fake
}

it('adds none for five pasted lines with one bad ID, then submits the corrected four atomically', async () => {
  const fake = setup()
  renderApp('/admin/whitelist', 375)
  const user = userEvent.setup({ delay: null })
  const paste = await screen.findByLabelText(/Or paste many/)
  const valid = ['101', '102', '103', '104'].map((n) => `100000000000000${n}, Person ${n}`)
  fireEvent.change(paste, { target: { value: [...valid.slice(0, 2), '12ab, Bad', ...valid.slice(2)].join('\n') } })
  await user.click(screen.getByRole('button', { name: 'Add the valid rows' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Row 3: "12ab"')
  expect(fake.rpc.mock.calls.some(([name]) => name === 'whitelist_add_many')).toBe(false)
  fireEvent.change(paste, { target: { value: valid.join('\n') } })
  await user.click(screen.getByRole('button', { name: 'Add the valid rows' }))
  expect(await screen.findByText('Person 104', { exact: false })).toBeVisible()
  expect(fake.rpc.mock.calls.filter(([name]) => name === 'whitelist_add_many')).toHaveLength(1)
  expect(screen.getByRole('heading', { name: /How to copy/ })).toBeVisible()
})

it('edits labels, toggles Admin, and requires confirmation before removing', async () => {
  const fake = setup()
  renderApp('/admin/whitelist')
  const user = userEvent.setup({ delay: null })
  await user.click(await screen.findByRole('button', { name: 'Edit label' }))
  const dialog = screen.getByRole('dialog')
  await user.clear(within(dialog).getByLabelText('Name label'))
  await user.type(within(dialog).getByLabelText('Name label'), 'New label')
  await user.click(within(dialog).getByRole('button', { name: 'Save' }))
  await screen.findByText('New label', { exact: false })
  await user.click(screen.getByRole('button', { name: 'Remove admin' }))
  await screen.findByRole('button', { name: 'Make admin' })
  await user.click(screen.getByRole('button', { name: 'Make admin' }))
  await screen.findByRole('button', { name: 'Remove admin' })
  await user.click(screen.getByRole('button', { name: 'Remove' }))
  expect(fake.rpc.mock.calls.some(([name]) => name === 'whitelist_remove')).toBe(false)
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Remove' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(screen.queryByText(initial.discord_id)).not.toBeInTheDocument())
})

it('shows server refusal on add and does not clear the input', async () => {
  const fake = setup()
  const base = fake.rpc.getMockImplementation()!
  fake.rpc.mockImplementation(async (name: string) => name === 'whitelist_add' ? { data: null, error: { message: 'Already on the whitelist.' } } : base(name))
  renderApp('/admin/whitelist')
  const user = userEvent.setup({ delay: null })
  await user.type(await screen.findByLabelText('Discord user ID'), initial.discord_id)
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Already on the whitelist.')
  expect(screen.getByLabelText('Discord user ID')).toHaveValue(initial.discord_id)
})

it('keeps viewers outside the admin page', async () => {
  h.db = makeFakeDb({ whoami: viewerJson() }).db
  renderApp('/admin/whitelist')
  await screen.findByRole('heading', { name: 'Home' })
  expect(screen.queryByLabelText('Discord user ID')).not.toBeInTheDocument()
})

it('keeps the confirmation open when the server protects the last admin', async () => {
  const fake = setup()
  const base = fake.rpc.getMockImplementation()!
  fake.rpc.mockImplementation(async (name: string) => name === 'whitelist_remove' ? { data: null, error: { message: 'Cannot remove the last admin. Make someone else an admin first.' } } : base(name))
  renderApp('/admin/whitelist')
  const user = userEvent.setup({ delay: null })
  await user.click(await screen.findByRole('button', { name: 'Remove' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Cannot remove the last admin')
  expect(screen.getByText(initial.discord_id)).toBeVisible()
})
