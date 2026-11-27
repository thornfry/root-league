import { describe, it, expect } from 'vitest'
import { encodeCsv, parseCsv, factionPicks } from './format'
import { zip, unzip } from './zip'
describe('CSV transport', () => {
  it('round trips quotes, newlines, null text, unicode and pipe arrays through zip', async () => {
    const file = { columns: ['name', 'ranks'], rows: [{ name: 'A,"B"\r\n树', ranks: 'cats|birds' }, { name: '', ranks: '' }] }
    const bytes = zip({ 'lists.csv': encodeCsv(file) })
    expect(parseCsv('lists.csv', (await unzip(bytes.buffer))['lists.csv']!)).toEqual(file)
  })
  it('names malformed cells by file, row and column', () => {
    expect(() => parseCsv('people.csv', 'id,name\n1,"bad')).toThrow('people.csv, row 2, column name')
    expect(() => parseCsv('people.csv', 'id,name\n1')).toThrow('people.csv, row 2, column name')
  })
  it('exports one rank per column using the D6 pipe array format', () => {
    expect(factionPicks({ 'people.csv': { columns: [], rows: [{ id: '1', display_name: 'A' }] }, 'lists.csv': { columns: [], rows: [{ person_id: '1', ranked_factions: 'cats|birds' }] } })).toEqual({ columns: ['player', 'rank_1', 'rank_2'], rows: [{ player: 'A', rank_1: 'cats', rank_2: 'birds' }] })
  })
})
