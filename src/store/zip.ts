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

import { deflateRawSync, inflateRawSync, createDeflateRaw, createInflateRaw } from "node:zlib";
import { openSync, closeSync, readSync, writeSync, unlinkSync, statSync } from "node:fs";

/** Streaming chunk size. Peak memory for a stream is this, not the file size. */
const CHUNK = 64 * 1024;

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

/** CRC over a chunk, continuing a running value (so a file streams without buffering). */
function crc32Chunk(buf: Uint8Array, crc: number): number {
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

/** Local-header bytes for an entry, with crc/csize/usize zeroed for a later patch. */
function localHeader(name: Uint8Array, method: number, time: number, date: number): Uint8Array {
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  return new Uint8Array([
    ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(time), ...u16(date),
    ...u32(0), ...u32(0), ...u32(0), ...u16(name.length), ...u16(0), ...name,
  ]);
}

/**
 * Stream files from disk into a zip in ONE pass, holding no entry in memory.
 *
 * The local header needs crc/csize/usize up front, which a stream only learns by
 * running. So it is written with those three fields zeroed, the entry is streamed
 * straight to the output file, and the header is then patched in place by seeking
 * back — which is why this takes a PATH and a seekable handle rather than a
 * buffer. Compressed bytes are written from the deflate 'data' handler as they
 * arrive, so neither side of the entry is ever accumulated.
 *
 * Peak memory is one CHUNK plus zlib's window, independent of file size: a
 * multi-GB session exports on a machine with little to spare. The wire format is
 * unchanged (still no data descriptors), so an older fox imports the result.
 */
export async function zipFilesTo(entries: { name: string; path: string }[], outPath: string, mtimeMs = Date.now()): Promise<void> {
  const enc = new TextEncoder();
  const { time, date } = dosTime(mtimeMs);
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const fd = openSync(outPath, "w");
  try {
    const central: Uint8Array[] = [];
    let offset = 0;
    // Every write is POSITIONAL and advances this counter. Relying on the
    // handle's own offset does not work: a positional write (the header patch)
    // does NOT move it, so the next append would land at offset 0 and chew
    // through the front of the archive.
    for (const e of entries) {
      const nameBytes = enc.encode(e.name);
      const size = statSync(e.path).size;
      // STORE vs DEFLATE decided from a 64-byte head sample, the same
      // heuristic the in-memory writer uses, without reading the file
      const probe = new Uint8Array(Math.min(CHUNK, size));
      const psrc = openSync(e.path, "r");
      let probeLen = 0;
      try {
        probeLen = size ? readSync(psrc, probe, 0, probe.length, 0) : 0;
      } finally {
        closeSync(psrc);
      }
      const head = probe.subarray(0, probeLen);
      const method = head.length < 64 || deflateRawSync(head).length >= head.length ? 0 : 8;

      const header = localHeader(nameBytes, method, time, date);
      const headerPos = offset;
      writeSync(fd, header, 0, header.length, headerPos);
      const dataStart = headerPos + header.length;

      const src = openSync(e.path, "r");
      let usize = 0;
      let crc = 0xffffffff;
      let csize = 0;
      try {
        if (method === 0) {
          const buf = new Uint8Array(CHUNK);
          for (;;) {
            const n = readSync(src, buf, 0, CHUNK, usize);
            if (n <= 0) break;
            crc = crc32Chunk(buf.subarray(0, n), crc);
            writeSync(fd, buf, 0, n, dataStart + usize);
            usize += n;
          }
          csize = usize;
        } else {
          // compressed bytes go straight to disk from the handler — the entry
          // is never held, and csize is only known once deflate has flushed
          const def = createDeflateRaw({ chunkSize: CHUNK });
          def.on("data", (c: Buffer) => {
            writeSync(fd, c, 0, c.length, dataStart + csize);
            csize += c.length;
          });
          const done = new Promise<void>((r) => def.on("end", () => r()));
          const buf = new Uint8Array(CHUNK);
          for (;;) {
            const n = readSync(src, buf, 0, CHUNK, usize);
            if (n <= 0) break;
            crc = crc32Chunk(buf.subarray(0, n), crc);
            // COPY the chunk: Buffer.from(arrayBuffer, …) is a VIEW, and deflate
            // consumes asynchronously — handing it a view of the reused read
            // buffer let the next readSync overwrite bytes zlib had not emitted
            // yet, and the archive failed its own CRC on read-back.
            def.write(Buffer.from(buf.subarray(0, n)));
            usize += n;
          }
          def.end();
          await done;
        }
      } finally {
        closeSync(src);
      }
      crc = (crc ^ 0xffffffff) >>> 0;

      // patch the three unknown fields into the local header
      const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
      hv.setUint32(14, crc, true);
      hv.setUint32(18, csize, true);
      hv.setUint32(22, usize, true);
      writeSync(fd, header, 0, header.length, headerPos);

      central.push(
        new Uint8Array([
          ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(time), ...u16(date),
          ...u32(crc), ...u32(csize), ...u32(usize), ...u16(nameBytes.length), ...u16(0), ...u16(0),
          ...u16(0), ...u16(0), ...u32(0), ...u32(headerPos), ...nameBytes,
        ]),
      );
      offset = dataStart + csize;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
      ...u32(cdSize), ...u32(offset), ...u16(0),
    ]);
    let p = offset;
    for (const c of [...central, eocd]) {
      writeSync(fd, c, 0, c.length, p);
      p += c.length;
    }
  } finally {
    closeSync(fd);
  }
}

/**
 * Stream ONE entry of an in-memory archive out to a file, never materialising
 * it. Compressed input is a subarray of the already-loaded archive, so this
 * bounds only the OUTPUT: a 2GB entry lands on disk in 64KB steps.
 *
 * The bomb guard applies to the running total, not just the declared size — an
 * entry may declare something plausible and still be a liar, so the stream is
 * cut off the moment actual output passes what the central directory claimed.
 * The existing length + CRC checks still run afterwards.
 */
export async function unzipEntryToFile(buf: Uint8Array, name: string, destPath: string): Promise<number> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
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
  for (let i = 0; i < count; i++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const entryName = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    if (entryName === name) {
      assertPlausibleSize(name, csize, usize);
      const lnlen = dv.getUint16(lho + 26, true);
      const lxlen = dv.getUint16(lho + 28, true);
      const raw = buf.subarray(lho + 30 + lnlen + lxlen, lho + 30 + lnlen + lxlen + csize);
      const wantCrc = dv.getUint32(p + 16, true);
      const fd = openSync(destPath, "w");
      try {
        let written = 0;
        let crc = 0xffffffff;
        const emit = (chunk: Uint8Array) => {
          if (written + chunk.length > usize) throw new Error(`zip: ${name} produced more than its declared ${usize} bytes`);
          crc = crc32Chunk(chunk, crc);
          writeSync(fd, chunk);
          written += chunk.length;
        };
        if (method === 0) emit(raw);
        else {
          const inf = createInflateRaw({ chunkSize: CHUNK });
          inf.on("data", (c: Buffer) => emit(new Uint8Array(c.buffer, c.byteOffset, c.byteLength)));
          const done = new Promise<void>((r) => inf.on("end", () => r()));
          inf.end(raw);
          await done;
        }
        crc = (crc ^ 0xffffffff) >>> 0;
        if (written !== usize) throw new Error(`zip: ${name} produced ${written}, declared ${usize}`);
        if (crc !== wantCrc) throw new Error(`zip: corrupt entry ${name}`);
        return written;
      } finally {
        closeSync(fd);
      }
    }
    p += 46 + nlen + xlen + clen;
  }
  throw new Error(`zip: no entry named ${name}`);
}

/** True when the buffer has a readable EOCD — i.e. it is a zip at all. */
export function isZip(buf: Uint8Array): boolean {
  if (buf.length < 22) return false;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) return true;
  }
  return false;
}

/** Does the central directory list this name? Parses no data, inflates nothing. */
export function zipHasEntry(buf: Uint8Array, name: string): boolean {
  const dec = new TextDecoder();
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return false;
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) return false;
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    if (dec.decode(buf.subarray(p + 46, p + 46 + nlen)) === name) return true;
    p += 46 + nlen + xlen + clen;
  }
  return false;
}

/**
 * Extract ONE small entry into memory (a manifest, a few KB). Guards its own
 * expansion, so it is safe even though it buffers — unlike the db, which is
 * streamed out by `unzipEntryToFile`.
 */
export function unzipEntry(buf: Uint8Array, name: string): Uint8Array {
  const dec = new TextDecoder();
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
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
  for (let i = 0; i < count; i++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    if (dec.decode(buf.subarray(p + 46, p + 46 + nlen)) === name) {
      assertPlausibleSize(name, csize, usize);
      const lnlen = dv.getUint16(lho + 26, true);
      const lxlen = dv.getUint16(lho + 28, true);
      const raw = buf.subarray(lho + 30 + lnlen + lxlen, lho + 30 + lnlen + lxlen + csize);
      const data = method === 0 ? raw.slice() : inflateRawSync(raw, usize > 0 ? { maxOutputLength: usize } : undefined);
      if (data.length !== usize || crc32(data) !== dv.getUint32(p + 16, true)) throw new Error(`zip: corrupt entry ${name}`);
      return data;
    }
    p += 46 + nlen + xlen + clen;
  }
  throw new Error(`zip: no entry named ${name}`);
}

/** One-shot equivalent, for small entries that are fine in memory. */
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
    assertPlausibleSize(name, csize, usize);
    // sizes live in the LOCAL header too; trust central (no data descriptors here)
    const lnlen = dv.getUint16(lho + 26, true);
    const lxlen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lxlen;
    const raw = buf.subarray(start, start + csize);
    // maxOutputLength is the second half of the guard: an entry may declare a
    // plausible size and still be a liar, so the inflater itself refuses to
    // produce more than the central directory claimed. A real archive's declared
    // size IS its exact size (this format writes no data descriptors), so this
    // never rejects a good entry.
    const data = method === 0 ? raw.slice() : inflateRawSync(raw, usize > 0 ? { maxOutputLength: usize } : undefined);
    if (data.length !== usize || crc32(data) !== dv.getUint32(p + 16, true)) throw new Error(`zip: corrupt entry ${name}`);
    out.set(name, data);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

/**
 * Declared-size to compressed-size ratio above which an entry is refused, and
 * the size below which the ratio is not consulted at all.
 *
 * A zip bomb is a small payload claiming an enormous one. A real session db
 * compresses to roughly 10:1 (SQLite pages are already half-compressible, and a
 * long transcript is prose and JSON), so 1000:1 sits far above anything
 * legitimate while catching the classic case: a few KB of zeros that expands to
 * gigabytes.
 *
 * This is deliberately NOT a byte cap. A session that has run for months can be
 * genuinely huge, and refusing it would break the one case the feature exists
 * to serve. The guard rejects an implausible SHAPE, not a large file — the
 * ceiling is relative to what the payload actually is, so big-but-real imports
 * cleanly.
 */
const MAX_EXPANSION_RATIO = 1000;
const RATIO_FLOOR = 1024 * 1024;

export function assertPlausibleSize(name: string, csize: number, usize: number): void {
  if (usize < RATIO_FLOOR) return; // small file: the ratio is meaningless noise
  if (csize > 0 && usize / csize > MAX_EXPANSION_RATIO) {
    throw new Error(
      `zip: ${name} declares ${(usize / 1e6).toFixed(1)}MB from ${csize} bytes — refusing an implausible expansion`,
    );
  }
}
