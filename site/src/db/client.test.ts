import { afterEach, vi } from 'vitest'

const { createClient, client } = vi.hoisted(() => {
  const client = {}
  return { createClient: vi.fn(() => client), client }
})
vi.mock('@supabase/supabase-js', () => ({ createClient }))

afterEach(() => {
  createClient.mockClear()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('the Supabase client', () => {
  it('is not configured without the two public variables', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { isConfigured, getSupabase } = await import('./client')
    expect(isConfigured()).toBe(false)
    expect(() => getSupabase()).toThrow(/VITE_SUPABASE_URL/)
  })

  it('is not configured with only one of them', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { isConfigured } = await import('./client')
    expect(isConfigured()).toBe(false)
  })

  it('builds one client from import.meta.env and reuses it', async () => {
    const url = 'https://supabase.example.test'
    const key = 'placeholder-anon-key'
    vi.stubEnv('VITE_SUPABASE_URL', url)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', key)
    const { isConfigured, getSupabase } = await import('./client')
    expect(isConfigured()).toBe(true)
    expect(getSupabase()).toBe(client)
    expect(getSupabase()).toBe(client)
    expect(createClient).toHaveBeenCalledExactlyOnceWith(url, key, { auth: { flowType: 'pkce' } })
  })
})
