import type pg from 'pg'
import { FACTIONS } from '../../src/data/factions'
import { SEASON_ID, withDatabase } from './database'
import { identity, type CastName } from './people'

export const POOL: string[] = FACTIONS.map((faction) => faction.code)
export const MAPS = ['Autumn', 'Winter']

export type GameState = 'upcoming' | 'recorded' | 'disputed' | 'settled' | 'void'

/** Season settings as the admin would save them: 8 players, 2 games each, a full pool, lists locking in a day. */
export async function configureSeason(db: pg.Client, lockInDays = 1): Promise<void> {
  await db.query(
    `update public.seasons set capacity = 8, games_each = 2, maps = $2, faction_pool = $3, min_list_length = 2,
       lists_lock_at = now() + ($4 * interval '1 day') where id = $1`,
    [SEASON_ID, MAPS, POOL, lockInDays],
  )
}

/** People with their placeholder Discord IDs, so the matching persona links to them at first sign-in. */
export async function createPeople(db: pg.Client, names: CastName[]): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  for (const name of names) {
    const { rows } = await db.query<{ id: string }>(
      'insert into public.people (display_name, discord_id) values ($1, $2) returning id',
      [name, identity(name).id],
    )
    ids[name] = rows[0]!.id
  }
  return ids
}

/** Puts people on a list in order, each with a full submitted ranked list. */
export async function addToRoster(
  db: pg.Client, ids: Record<string, string>, list: 'league' | 'waitlist', names: CastName[], options: { numbers?: boolean; factions?: string[] } = {},
): Promise<void> {
  const factions = options.factions ?? POOL
  for (const [index, name] of names.entries()) {
    await db.query(
      `insert into public.roster (season_id, person_id, list, position, ranked_factions, list_submitted, player_number)
       values ($1, $2, $3, $4, $5, true, $6)`,
      [SEASON_ID, ids[name], list, index + 1, factions, options.numbers ? index + 1 : null],
    )
  }
}

/** Who sits where in game number n, and which factions they hold. The patterns repeat after five games. */
const TABLES: { seats: CastName[]; factions: string[] }[] = [
  { seats: ['Delaney', 'Alex', 'Matt', 'Nick'], factions: ['cats', 'birds', 'otters', 'WA'] },
  { seats: ['Adam', 'Zach', 'Kyra', 'Anthony'], factions: ['rats', 'frogs', 'vagabond', 'crows'] },
  { seats: ['Delaney', 'Adam', 'Alex', 'Zach'], factions: ['badgers', 'moles', 'bats', 'lizards'] },
  { seats: ['Matt', 'Nick', 'Kyra', 'Anthony'], factions: ['cats', 'birds', 'knaves', 'WA'] },
  { seats: ['Delaney', 'Matt', 'Kyra', 'Zach'], factions: ['rats', 'moles', 'otters', 'crows'] },
]

export interface LiveSeason {
  ids: Record<string, string>
  games: { id: string; no: number; seats: CastName[] }[]
}

/**
 * A started season. Eight league players (Delaney to Anthony), David on the waitlist, and one game per entry of
 * `states`, each in the state given. Spectator, Chuck and the admin exist as people with no roster place. The
 * first seat of a recorded game answers for themselves; a disputed game has two different answers; a settled
 * game is settled for its second seat.
 */
export async function seedLiveSeason(states: GameState[]): Promise<LiveSeason> {
  return withDatabase(async (db) => {
    await db.query(
      `update public.seasons set capacity = 8, games_each = 2, maps = $2, faction_pool = $3, min_list_length = 2,
         lists_lock_at = now() - interval '2 days', started_at = now() - interval '1 day' where id = $1`,
      [SEASON_ID, MAPS, POOL],
    )
    const league: CastName[] = ['Delaney', 'Alex', 'Matt', 'Nick', 'Adam', 'Zach', 'Kyra', 'Anthony']
    const ids = await createPeople(db, ['Dev admin', ...league, 'David', 'Spectator', 'Chuck'])
    await addToRoster(db, ids, 'league', league, { numbers: true })
    await addToRoster(db, ids, 'waitlist', ['David'])
    const games: LiveSeason['games'] = []
    for (const [index, state] of states.entries()) {
      const table = TABLES[index % TABLES.length]!
      const { rows } = await db.query<{ id: string }>(
        'insert into public.games (season_id, game_no, map_index, void) values ($1, $2, $3, $4) returning id',
        [SEASON_ID, index + 1, index % MAPS.length, state === 'void'],
      )
      const id = rows[0]!.id
      for (const [seat, name] of table.seats.entries()) {
        await db.query('insert into public.game_seats (game_id, seat, person_id, faction) values ($1, $2, $3, $4)',
          [id, seat + 1, ids[name], table.factions[seat]])
      }
      const [first, second] = [ids[table.seats[0]!]!, ids[table.seats[1]!]!]
      if (state === 'recorded' || state === 'disputed') {
        await db.query('insert into public.submissions (game_id, person_id, winners) values ($1, $2, $3)', [id, first, [first]])
      }
      if (state === 'disputed') {
        await db.query('insert into public.submissions (game_id, person_id, winners) values ($1, $2, $3)', [id, second, [second]])
      }
      if (state === 'settled') {
        await db.query('insert into public.settlements (game_id, winners, settled_by) values ($1, $2, $3)', [id, [second], ids['Dev admin']])
      }
      games.push({ id, no: index + 1, seats: table.seats })
    }
    return { ids, games }
  })
}

export async function addPick(
  db: pg.Client, gameId: string, person: string, first: string, second: string | null = null,
): Promise<void> {
  await db.query('insert into public.picks (game_id, person_id, first_pick, second_pick) values ($1, $2, $3, $4)', [gameId, person, first, second])
}
