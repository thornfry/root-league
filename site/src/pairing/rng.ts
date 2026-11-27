// A small seeded random number generator, so the same seed always gives the
// same player numbers and the same draft. It is sfc32 seeded through the
// cyrb128 string hash, both public domain; nothing here is cryptographic.

/** A seed is text (shown on screen) or a number, which counts as its decimal text. */
export type Seed = string | number

export interface Rng {
  /** A float in [0, 1). */
  next(): number
  /** An integer in [0, maxExclusive). */
  int(maxExclusive: number): number
  /** A shuffled copy; the input is not changed. */
  shuffle<T>(items: readonly T[]): T[]
}

/** cyrb128: four 32-bit words from a string. */
function hashSeed(text: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
}

export function createRng(seed: Seed): Rng {
  let [a, b, c, d] = hashSeed(String(seed))

  const next = (): number => {
    // sfc32
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
  // Mix the state before the first draw so nearby seeds do not start alike.
  for (let i = 0; i < 12; i++) next()

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
      throw new RangeError(`int() needs a whole number of at least 1, got ${maxExclusive}`)
    }
    return Math.floor(next() * maxExclusive)
  }

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1)
      ;[out[i], out[j]] = [out[j] as T, out[i] as T]
    }
    return out
  }

  return { next, int, shuffle }
}

/** A fresh seed for a re-roll: 8 hex digits, short enough to read out. */
export function newSeed(): string {
  const words = new Uint32Array(1)
  globalThis.crypto.getRandomValues(words)
  return (words[0] as number).toString(16).padStart(8, '0')
}
