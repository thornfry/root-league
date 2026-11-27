// ZIP store writer; reader also accepts the deflate method used by common zip tools.
const encoder = new TextEncoder()
function crc(bytes: Uint8Array) { let n = 0xffffffff; for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0) } return (n ^ 0xffffffff) >>> 0 }
function header(size: number) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) } }
export function zip(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [], directory: Uint8Array[] = []; let offset = 0, centralSize = 0
  for (const [name, text] of Object.entries(files)) {
    const filename = encoder.encode(name), data = encoder.encode(text), checksum = crc(data)
    const h = header(30 + filename.length); h.view.setUint32(0, 0x04034b50, true); h.view.setUint16(4, 20, true); h.view.setUint32(14, checksum, true); h.view.setUint32(18, data.length, true); h.view.setUint32(22, data.length, true); h.view.setUint16(26, filename.length, true); h.bytes.set(filename, 30)
    parts.push(h.bytes, data)
    const d = header(46 + filename.length); d.view.setUint32(0, 0x02014b50, true); d.view.setUint16(4, 20, true); d.view.setUint16(6, 20, true); d.view.setUint32(16, checksum, true); d.view.setUint32(20, data.length, true); d.view.setUint32(24, data.length, true); d.view.setUint16(28, filename.length, true); d.view.setUint32(42, offset, true); d.bytes.set(filename, 46); directory.push(d.bytes); centralSize += d.bytes.length; offset += h.bytes.length + data.length
  }
  const end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, directory.length, true); end.view.setUint16(10, directory.length, true); end.view.setUint32(12, centralSize, true); end.view.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + 22); let at = 0; for (const p of [...parts, ...directory, end.bytes]) { out.set(p, at); at += p.length } return out
}
export async function unzip(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const v = new DataView(buffer), bytes = new Uint8Array(buffer), out: Record<string, string> = {}; let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && v.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0 || v.getUint32(end, true) !== 0x06054b50) throw new Error('Invalid zip directory.')
  let at = v.getUint32(end + 16, true)
  for (let i = 0; i < v.getUint16(end + 10, true); i++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error('Invalid zip entry.')
    const method = v.getUint16(at + 10, true), size = v.getUint32(at + 20, true), n = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.slice(at + 46, at + 46 + n))
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    let data = bytes.slice(start, start + size)
    if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
    else if (method !== 0) throw new Error(`${name}: Unsupported zip compression.`)
    if (crc(data) !== v.getUint32(at + 16, true)) throw new Error(`${name}: Damaged zip entry.`)
    if (!name.endsWith('/')) { if (name in out) throw new Error(`${name}: Duplicate file.`); out[name] = new TextDecoder('utf-8', { fatal: true }).decode(data) }
    at += 46 + n + v.getUint16(at + 30, true) + v.getUint16(at + 32, true)
  }
  return out
}
