/**
 * Whether this build carries the dev sign-in stand-in. The stand-in page itself is only imported behind the same
 * literal comparison in `AppGate.tsx`, so a build without it contains none of that code.
 */
export const isDevAuth = (): boolean => import.meta.env.VITE_AUTH_MODE === 'dev'
