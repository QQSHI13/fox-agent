/**
 * LSP's base protocol framing: `Content-Length: N\r\n\r\n<N bytes of JSON>`.
 *
 * Hand-rolled rather than pulled from `vscode-jsonrpc`, because that package
 * brings a Node stream abstraction fox would have to adapt Bun's `FileSink` into
 * anyway (the same friction the ACP layer already pays twice), and the entire
 * codec is the two functions below. One dependency avoided for ~40 lines.
 *
 * The length is a *byte* count, not a character count — a message containing any
 * non-ASCII text (an identifier in a diagnostic, a path with an accent) frames
 * short if you use `string.length`, and every subsequent message on the
 * connection desynchronizes. Both directions here go through Buffer for that
 * reason.
 */

/** Frame one JSON-RPC message for writing to a server's stdin. */
export function encode(msg: unknown): { header: string; body: Buffer } {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  return { header: `Content-Length: ${body.byteLength}\r\n\r\n`, body };
}

/**
 * Incremental frame reader.
 *
 * A stdout chunk boundary has nothing to do with a message boundary: one read
 * may carry half a header, or three whole messages plus a fragment. `push`
 * therefore buffers and returns every *complete* message it can, keeping the
 * remainder for the next call.
 */
export class FrameReader {
  private buf = Buffer.alloc(0);

  push(chunk: Uint8Array): unknown[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, Buffer.from(chunk)]) : Buffer.from(chunk);
    const out: unknown[] = [];
    for (;;) {
      const sep = this.buf.indexOf("\r\n\r\n");
      if (sep < 0) break;
      const header = this.buf.subarray(0, sep).toString("utf8");
      const len = Number(/^content-length:[ \t]*(\d+)/im.exec(header)?.[1]);
      if (!Number.isFinite(len)) {
        // A header with no usable Content-Length cannot be resynchronized from —
        // there is no way to know where its body ends. Drop it and continue at
        // the next frame rather than spinning on the same bytes forever.
        this.buf = this.buf.subarray(sep + 4);
        continue;
      }
      if (this.buf.byteLength < sep + 4 + len) break; // body still arriving
      const body = this.buf.subarray(sep + 4, sep + 4 + len).toString("utf8");
      this.buf = this.buf.subarray(sep + 4 + len);
      try {
        out.push(JSON.parse(body));
      } catch {
        // a malformed body is one lost message, not a lost connection
      }
    }
    return out;
  }
}
