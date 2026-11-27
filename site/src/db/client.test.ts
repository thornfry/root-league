import { afterEach } from 'vitest'

afterEach(() => {
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
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { isConfigured } = await import('./client')
    expect(isConfigured()).toBe(false)
  })

  it('builds one client from import.meta.env and reuses it', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'placeholder-anon-key')
    const { isConfigured, getSupabase } = await import('./client')
    expect(isConfigured()).toBe(true)
    expect(getSupabase()).toBe(getSupabase())
  })
})
