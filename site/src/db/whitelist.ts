import { getSupabase } from './client'
import type { Database } from './types'

export type WhitelistEntry = Database['public']['Tables']['whitelist']['Row'] & { added_by_name: string }
export type Invite = { discord_id: string; label: string }

/** Keep IDs as strings: Discord snowflakes exceed JavaScript's safe integer range. */
export function parseInvites(text: string, existing: readonly string[] = []) {
  const entries: Invite[] = []
  const errors: string[] = []
  const seen = new Set(existing)
  text.split('\n').forEach((line, index) => {
    if (!line.trim()) return
    const comma = line.indexOf(',')
    const discord_id = (comma < 0 ? line : line.slice(0, comma)).trim()
    const label = comma < 0 ? '' : line.slice(comma + 1).trim()
    if (!/^[0-9]{15,20}$/.test(discord_id)) {
      errors.push(`Row ${index + 1}: "${discord_id}" is not a Discord user ID. Use digits only, 15 to 20 of them.`)
    } else if (seen.has(discord_id)) {
      errors.push(`Row ${index + 1}: ${discord_id} is already on the whitelist or repeats an earlier row.`)
    }
    seen.add(discord_id)
    entries.push({ discord_id, label })
  })
  if (!entries.length) errors.push('Paste at least one Discord user ID.')
  return { entries, errors }
}

export async function listWhitelist(): Promise<WhitelistEntry[]> {
  const { data, error } = await getSupabase().from('whitelist')
    .select('*, added_person:people!whitelist_added_by_fkey(display_name)').order('added_at').order('discord_id')
  if (error) throw error
  return (data ?? []).map(({ added_person, ...row }) => ({ ...row, added_by_name: added_person?.display_name ?? 'Seed' }))
}

export type WhitelistChange =
  | { kind: 'add'; id: string; label: string }
  | { kind: 'many'; entries: Invite[] }
  | { kind: 'label'; id: string; label: string }
  | { kind: 'remove'; id: string }
  | { kind: 'admin'; id: string; admin: boolean }

export async function changeWhitelist(change: WhitelistChange) {
  const db = getSupabase()
  const result = await (() => {
    switch (change.kind) {
      case 'add': return db.rpc('whitelist_add', { p_discord_id: change.id.trim(), p_label: change.label.trim() })
      case 'many': return db.rpc('whitelist_add_many', { p_entries: change.entries })
      case 'label': return db.rpc('whitelist_label', { p_discord_id: change.id, p_label: change.label.trim() })
      case 'remove': return db.rpc('whitelist_remove', { p_discord_id: change.id })
      case 'admin': return db.rpc('whitelist_set_admin', { p_discord_id: change.id, p_is_admin: change.admin })
    }
  })()
  if (result.error) throw result.error
}
