/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { leagueContent } from './src/content/build.ts'
import { defineConfig, loadEnv } from 'vite'

/** Modes that may carry the dev sign-in stand-in. Every other build mode is a real deployment. */
const DEV_MODES = ['dev', 'development', 'test']

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const authMode = env.VITE_AUTH_MODE || 'discord'
  if (authMode !== 'discord' && authMode !== 'dev') {
    throw new Error(`VITE_AUTH_MODE must be "discord" or "dev", not "${authMode}".`)
  }
  // Guard one of three (decision 41): a deployable build can never ask for the stand-in.
  if (command === 'build' && authMode === 'dev' && !DEV_MODES.includes(mode)) {
    throw new Error(
      `VITE_AUTH_MODE=dev is only for local builds (build:dev). Refusing to build mode "${mode}" with the dev sign-in stand-in.`,
    )
  }
  return {
    plugins: [react(), leagueContent(env.VITE_REPO_URL)],
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    },
  }
})
