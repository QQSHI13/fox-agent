/**
 * Minimal ZIP reader/writer — just enough to package a session (one SQLite db
 * + a manifest) into a single `.fox.zip` file that any fox-agent on any device
 * can import.
 *
 * Why not `Bun.Archive`: it exists but is undocumented and its surface has
 * churned between Bun versions — the import path must keep working on whatever
 * Bun the receiving device runs, so the format is implemented here against
 * `node:zlib` (deflateRaw/inflateRaw), which is frozen. STORE is supported for
 * entries that do not compress; DEFLATE for everything else. No encryption, no
 * zip64 (session dbs are far below 4GB), no data descriptors (entries are
 * buffered, so sizes are known upfront).
 */

import { deflateRawSync, inflateRawSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP DOS timestamp from a unix ms value (2s granularity, local-time semantics ignored). */
function dosTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  return {
    time: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f),
  };
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Build a zip archive from in-memory entries. */
export function zipSync(entries: ZipEntry[], mtimeMs = Date.now()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosTime(mtimeMs);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    let method = 8;
    let data: Uint8Array = deflateRawSync(e.data, { level: 6 });
    // tiny or incompressible entries: STORE beats a deflate round-trip
    if (data.length >= e.data.length || e.data.length < 64) {
      method = 0;
      data = e.data;
    }
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(data.length), ...u32(e.data.length), ...u16(name.length), ...u16(0),
      ...name,
    ]);
    const cd = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(time), ...u16(date),
      ...u32(crc), ...u32(data.length), ...u32(e.data.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    ]);
    chunks.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ]);
  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of [...chunks, ...central, eocd]) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** Read a zip archive back into name -> data. Throws on structural damage. */
export function unzipSync(buf: Uint8Array): Map<string, Uint8Array> {
  const dec = new TextDecoder();
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // find the EOCD from the end (comment could theoretically push it back)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip: bad central directory");
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    // sizes live in the LOCAL header too; trust central (no data descriptors here)
    const lnlen = dv.getUint16(lho + 26, true);
    const lxlen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lxlen;
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw.slice() : inflateRawSync(raw);
    if (data.length !== usize || crc32(data) !== dv.getUint32(p + 16, true)) throw new Error(`zip: corrupt entry ${name}`);
    out.set(name, data);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
