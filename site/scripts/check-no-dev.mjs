// Guard two of three (decision 41): fails if a built site carries the dev sign-in stand-in.
// Usage: node scripts/check-no-dev.mjs [dir]   (default: dist)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The marker is exported by src/auth/DevSignIn.tsx; its test keeps the two in step.
export const FORBIDDEN = ['rl-dev-signin-standin', 'dev.invalid']

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else yield path
  }
}

/** Returns one `{ file, needle }` for each forbidden string found anywhere under `dir`. */
export function findDev(dir) {
  const hits = []
  for (const file of files(dir)) {
    const text = readFileSync(file, 'latin1')
    for (const needle of FORBIDDEN) if (text.includes(needle)) hits.push({ file, needle })
  }
  return hits
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? 'dist')
  let hits
  try {
    hits = findDev(dir)
  } catch (error) {
    console.error(`check-no-dev: cannot read ${dir}. Run the build first.`)
    console.error(String(error))
    process.exit(2)
  }
  if (hits.length > 0) {
    console.error('check-no-dev: the dev sign-in stand-in is in this build:')
    for (const { file, needle } of hits) console.error(`  ${file} contains "${needle}"`)
    process.exit(1)
  }
  console.log(`check-no-dev: ${dir} has no dev sign-in stand-in.`)
}
