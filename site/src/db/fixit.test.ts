import { describe, expect, it } from 'vitest'
import { describeLog, removesText } from './fixit'

const look = { person: (id: string) => ({ a: 'Alex', b: 'Blair' })[id], game: (id: string) => (id === 'g' ? 'Table 3' : undefined) }

describe('removesText', () => {
  it('names the counts that go with a person', () => {
    expect(removesText({ roster: 1, submissions: 2, picks: 3, pick_mentions: 1 }))
      .toBe('This also deletes 1 roster entry, 2 submissions, 3 picks and 1 pick by other players that names them.')
  })
  it('says so when nothing else goes', () => {
    expect(removesText({ roster: 0, submissions: 0, picks: 0 })).toBe('Nothing else goes with it.')
  })
})

describe('describeLog', () => {
  it('lists only the changed columns of an update, with names for ids', () => {
    const t = describeLog({ table_name: 'game_seats', action: 'update', old: { game_id: 'g', seat: 2, person_id: 'a', faction: 'cats' }, new: { game_id: 'g', seat: 2, person_id: 'b', faction: 'cats' } }, look)
    expect(t).toEqual({ what: 'Seats: Table 3 seat 2 changed', old: 'person_id: Alex', next: 'person_id: Blair' })
  })
  it('shows an added and a removed row', () => {
    expect(describeLog({ table_name: 'picks', action: 'insert', old: null, new: { game_id: 'g', person_id: 'a', first_pick: 'b', second_pick: null } }, look))
      .toEqual({ what: 'Pick’ems: Table 3, Alex added', old: 'none', next: 'person_id: Alex; first_pick: Blair; second_pick: none' })
    expect(describeLog({ table_name: 'people', action: 'delete', old: { id: 'a', display_name: 'Alex' }, new: null }, look))
      .toEqual({ what: 'People: Alex removed', old: 'display_name: Alex', next: 'none' })
  })
})
