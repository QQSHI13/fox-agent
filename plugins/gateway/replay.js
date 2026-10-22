/*
 * replay.js - turn a stored transcript into render items.
 *
 * Why this is its own file rather than a loop inside ui.js: the pairing rule is
 * the only non-obvious part of replaying a session, and it is pure data in,
 * data out. Here it can be tested against the shapes the store actually
 * produces; inside the UI it could only be eyeballed.
 *
 * The rule the store imposes: an assistant row may carry `tool_calls` (JSON
 * `[{id, name, arguments}]`) and the `tool` row that answers each call carries
 * `content` (the output) plus `tool_call_id`. So a tool row does not know its
 * own tool name - it must be looked up among the calls that preceded it. That
 * is why the old UI could only say "tool".
 *
 * Classic script, like md.js: the page stays loadable from file://, and
 * `bun test` can evaluate it directly.
 */
(function (global) {
  "use strict";

  /** A JSON string of tool calls, or null when the row has none / is corrupt. */
  function parseCalls(raw) {
    if (!raw) return null;
    try {
      var v = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!Array.isArray(v)) return null;
      return v.filter(function (c) {
        return c && typeof c === "object" && typeof c.name === "string";
      });
    } catch (e) {
      // A transcript must render even when one row is corrupt: a bad
      // tool_calls blob costs that card its name, not the session.
      return null;
    }
  }

  /**
   * `arguments` is a JSON string on the wire. Show an object as compact JSON
   * and a scalar as-is; never show a quoted string, which reads like a bug.
   */
  function argText(raw) {
    if (raw === undefined || raw === null) return "";
    if (typeof raw !== "string") return safeStringify(raw);
    var s = raw.trim();
    if (!s) return "";
    try {
      var v = JSON.parse(s);
      if (typeof v === "string") return v;
      return safeStringify(v);
    } catch (e) {
      return s;
    }
  }

  function safeStringify(v) {
    try {
      return JSON.stringify(v);
    } catch (e) {
      return String(v);
    }
  }

  /**
   * Messages -> ordered render items.
   *
   *   { kind: "message", role, content, seq }
   *   { kind: "tool", name, args, output, ok, seq }
   *
   * An assistant row is BOTH a possible message and the declaration of the tool
   * calls that follow it, so it is not skipped here: its text becomes a message
   * item (when it has text) and its calls are registered for the tool rows below.
   * Whether an empty one is drawn is the UI's call - the renderer skips it, a
   * caller that wants every row still gets it.
   *
   * `ok` is `undefined` for history: the store keeps the failure in a column
   * this projection does not carry, so a replayed card reports "done" rather
   * than inventing a pass. Live cards get their real state from tool_end.
   */
  function pair(messages) {
    var out = [];
    var calls = new Map();
    (messages || []).forEach(function (m) {
      if (!m) return;
      if (m.role === "assistant") {
        var list = parseCalls(m.tool_calls);
        if (list) {
          list.forEach(function (c) {
            if (c.id) calls.set(String(c.id), { name: c.name, args: argText(c.arguments) });
          });
        }
        out.push({ kind: "message", role: "assistant", content: m.content || "", seq: m.seq });
        return;
      }
      if (m.role === "tool") {
        var hit = m.tool_call_id ? calls.get(String(m.tool_call_id)) : undefined;
        out.push({
          kind: "tool",
          name: hit ? hit.name : "tool",
          args: hit ? hit.args : "",
          output: m.content || "",
          ok: undefined,
          seq: m.seq,
        });
        return;
      }
      out.push({ kind: "message", role: m.role, content: m.content || "", seq: m.seq });
    });
    return out;
  }

  global.FoxReplay = { pair: pair, parseCalls: parseCalls, argText: argText };
})(typeof globalThis !== "undefined" ? globalThis : this);
