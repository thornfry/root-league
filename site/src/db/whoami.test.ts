import { parseWhoami } from './whoami'

describe('parseWhoami', () => {
  it('reads the full answer for an admin', () => {
    const me = parseWhoami({
      signed_in: true,
      discord_id: '1',
      discord_name: 'x',
      whitelisted: true,
      is_admin: true,
      person_id: 'p',
      display_name: 'Will',
      roles: ['viewer', 'admin'],
    })
    expect(me).toMatchObject({ signedIn: true, whitelisted: true, isAdmin: true, displayName: 'Will', roles: ['viewer', 'admin'] })
  })

  it('never reports an admin who is not whitelisted', () => {
    expect(parseWhoami({ signed_in: true, whitelisted: false, is_admin: true }).isAdmin).toBe(false)
  })

  it('reads nothing, an array or junk as signed out', () => {
    for (const bad of [null, [], 'x', 3]) {
      expect(parseWhoami(bad)).toMatchObject({ signedIn: false, whitelisted: false, isAdmin: false, roles: [] })
    }
  })
})
