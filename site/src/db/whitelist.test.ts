import { changeWhitelist, listWhitelist, parseInvites } from './whitelist'
import { makeFakeDb } from '../test-support/fakeDb'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('./client', () => ({ getSupabase: () => h.db }))

it('names the original bad line and preserves snowflakes and labels', () => {
  const result = parseInvites('100000000000000101, One\n\n12ab, Bad\n100000000000000102, Two, Jr')
  expect(result.errors).toEqual([expect.stringContaining('Row 3: "12ab"')])
  expect(result.entries[0]).toEqual({ discord_id: '100000000000000101', label: 'One' })
  expect(result.entries[2]?.label).toBe('Two, Jr')
})

it('refuses empty input, wrong lengths, duplicates within the paste and existing accounts', () => {
  expect(parseInvites(' \n').errors).toHaveLength(1)
  expect(parseInvites('123').errors).toHaveLength(1)
  expect(parseInvites('100000000000000101\n100000000000000101').errors[0]).toContain('Row 2')
  expect(parseInvites('100000000000000101', ['100000000000000101']).errors[0]).toContain('Row 1')
})

it('reads inviter names through the whitelist relationship', async () => {
  const order = vi.fn().mockReturnThis()
  order.mockReturnValueOnce({ order }).mockResolvedValueOnce({ data: [{ discord_id: '100000000000000101', added_person: { display_name: 'Will' } }], error: null })
  const select = vi.fn(() => ({ order }))
  h.db = { from: vi.fn(() => ({ select })) }
  expect(await listWhitelist()).toEqual([{ discord_id: '100000000000000101', added_by_name: 'Will' }])
  expect(select).toHaveBeenCalledWith('*, added_person:people!whitelist_added_by_fkey(display_name)')
})

it('uses one atomic bulk RPC and propagates server row errors', async () => {
  const fake = makeFakeDb()
  h.db = fake.db
  const error = { message: 'Nothing was added. Row 2: Already on the whitelist.', details: '[]' }
  fake.rpc.mockResolvedValueOnce({ data: null, error })
  const entries = parseInvites('100000000000000101\n100000000000000102').entries
  await expect(changeWhitelist({ kind: 'many', entries })).rejects.toEqual(error)
  expect(fake.rpc).toHaveBeenCalledExactlyOnceWith('whitelist_add_many', { p_entries: entries })
})
