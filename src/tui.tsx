// foxc TUI v4 — idiomatic solid-js on @opentui/solid (built via babel-preset-solid,
// see scripts/build.ts). Fine-grained reactivity: keystrokes update one text node,
// streaming updates one markdown node — no full redraws, no flicker.
//
// Layout: full-screen scrollbox (flexGrow 1) + reactive bottom dock (hints /
// colored input / status bar). Input is multi-line; "\" escapes next char or
// Enter. "!" runs local shell, "/" commands (Enter runs exact or unique prefix;
// arg-commands autocomplete). Prompts typed while busy are queued. Esc
// interrupts the agent. Ctrl+C copies input (exits empty), Ctrl+V pastes.
import { render, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { createSignal, createComponent, For, Show, onCleanup } from "solid-js";
import type { CliRenderer } from "@opentui/core";
import { runTurn } from "./loop/agent.ts";
import { projectView, viewTokenEstimate } from "./loop/context.ts";
import { getSession, sessionUsage } from "./store/db.ts";
import { runSlashCommand, COMMANDS, type HarnessState } from "./commands.ts";

interface Ch {
  c: string;
  lit: boolean;
}
interface Item {
  k: number;
  kind: "user" | "tool" | "info" | "error" | "md" | "think";
  text: string;
}

const C = {
  user: "#7aa2f7",
  tool: "#e0af68",
  info: "#89ddff",
  hint: "#565f89",
  error: "#f7768e",
  chrome: "#565f89",
  hintSel: "#c0caf5",
  accent: "#bb9af7",
  ok: "#9ece6a",
};

const ARG_COMMANDS = new Set(["/resume", "/model"]);

let keySeq = 0;
const nk = () => ++keySeq;

// clipboard with zero deps: OSC52 for copy (works over ssh/wsl), native spawners for paste
function osc52Copy(s2: string) {
  try {
    const b64 = Buffer.from(s2, "utf8").toString("base64");
    process.stdout.write(`\x1b]52;c;${b64}\x07`);
  } catch {}
}

async function clipWrite(s2: string): Promise<boolean> {
  osc52Copy(s2);
  const cmds: string[][] = [
    ["powershell.exe", "-NoProfile", "-Command", `Set-Clipboard -Value '${s2.replaceAll("'", "''")}'`],
    ["wl-copy"],
    ["xclip", "-selection", "clipboard", "-in"],
  ];
  for (const argv of cmds) {
    try {
      const p = Bun.spawn(argv, { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
      if (argv[0] === "xclip") p.stdin.write(s2);
      await p.exited;
      if (p.exitCode === 0) return true;
    } catch {}
  }
  return false;
}

async function clipRead(): Promise<string> {
  const cmds: string[][] = [
    ["powershell.exe", "-NoProfile", "-Command", "Get-Clipboard"],
    ["wl-paste", "--no-newline"],
    ["xclip", "-selection", "clipboard", "-o"],
  ];
  for (const argv of cmds) {
    try {
      const p = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
      const timer = setTimeout(() => { try { p.kill(); } catch {} }, 1500);
      const out = await new Response(p.stdout).text();
      clearTimeout(timer);
      const code = await p.exited;
      if (code === 0 && out) return out.replace(/\r/g, "");
    } catch {}
  }
  return "";
}



export async function startTui(state: HarnessState) {
  const [items, setItems] = createSignal<Item[]>([]);
  const [streamText, setStreamText] = createSignal<string | null>(null);
  const [showThink, setShowThink] = createSignal(false);
  const [buf, setBuf] = createSignal<Ch[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [queuedCount, setQueuedCount] = createSignal(0);
  const [flash, setFlash] = createSignal("");
  const [hintSel, setHintSel] = createSignal(0);

  let renderer: CliRenderer | null = null;
  let sb: any = null;
  let dimAcc: any = null;
  let stick = true; // autoscroll unless user scrolled up
  let ac: AbortController | null = null;
  const queued: string[] = [];

  function gracefulExit(code = 0): never {
    try {
      ac?.abort();
      renderer?.stop();
      renderer?.destroy();
    } catch {}
    process.exit(code);
  }

  const display = (): string =>
    buf()
      .map((c) => c.c)
      .join("");
  const firstCharLit = (): boolean => buf().find((c) => c.c.trim().length > 0)?.lit ?? false;

  function width(): number {
    return Math.max(30, (dimAcc?.()?.width ?? 80) - 2);
  }

  function wrap(s: string, w: number): string[] {
    const out: string[] = [];
    for (const para of s.split("\n")) {
      if (para.length <= w) {
        out.push(para);
        continue;
      }
      let line = "";
      for (const word of para.split(" ")) {
        let wd = word;
        while ((line ? line.length + 1 : 0) + wd.length > w) {
          if (line) out.push(line);
          const take = wd.slice(0, Math.max(1, w - line.length));
          out.push(take);
          wd = wd.slice(take.length);
          line = "";
        }
        line += (line ? " " : "") + wd;
      }
      out.push(line);
    }
    return out;
  }

  function oneLine(s2: string, n = 150): string {
    const t = s2.replace(/\n/g, " ");
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function statusText(): string {
    try {
      const u = sessionUsage(state.sessionId);
      const nodes = projectView(state.sessionId);
      const vis = nodes.filter((n) => !n.deleted).length;
      const home = process.env.HOME ?? "";
      const cwdShort = home && state.cwd.startsWith(home) ? "~" + state.cwd.slice(home.length) : state.cwd;
      const q = queuedCount() ? ` · ${queuedCount()} queued` : "";
      return `${cwdShort} · ${vis}/${nodes.length} nodes · ~${viewTokenEstimate(nodes)} est · p${u.prompt}+g${u.completion} tok · ${state.provider.model}${q}`;
    } catch {
      return state.cwd;
    }
  }

  function loadItems(): Item[] {
    const out: Item[] = [];
    const nodes = projectView(state.sessionId).filter((n) => !n.deleted);
    for (const n of nodes.slice(-300)) {
      if (n.msg.role === "user") out.push({ k: nk(), kind: "user", text: `[m${n.msg.seq}] you  ${n.content}` });
      else if (n.msg.role === "tool") out.push({ k: nk(), kind: "tool", text: `[m${n.msg.seq}] tool ${n.content}` });
      else if (n.msg.role === "think") out.push({ k: nk(), kind: "think", text: n.content });
      else out.push({ k: nk(), kind: "md", text: n.content || "" });
    }
    return out;
  }

  function refresh() {
    setItems(loadItems());
    stickScroll();
  }

  function stickScroll() {
    if (stick) setTimeout(() => { try { if (sb) sb.scrollTop = sb.scrollHeight ?? 1e9; } catch {} }, 20);
  }

  function push(kind: Item["kind"], text: string) {
    setItems((prev) => [...prev, { k: nk(), kind, text }]);
    stickScroll();
  }

  // ---- dispatch ----

  async function runShell(cmd: string) {
    setBusy(true);
    push("tool", `$ ${cmd}`);
    try {
      const proc = Bun.spawn(["/bin/bash", "-c", cmd], { cwd: state.cwd, stdout: "pipe", stderr: "pipe", env: process.env });
      const timer = setTimeout(() => proc.kill(9), 120_000);
      const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      clearTimeout(timer);
      const code = await proc.exited;
      const merged = (out + (err ? (out ? "\n[stderr]\n" : "") + err : "")).trimEnd() || "(no output)";
      push("info", `${merged}\nexit ${code}`);
    } catch (e) {
      push("error", `shell error: ${(e as Error).message}`);
    }
    setBusy(false);
    drainQueue();
  }

  function runSlash(t: string) {
    if (t === "/help" || t === "/?")
      push(
        "info",
        COMMANDS.map((c) => `${c.name.padEnd(12)} ${c.desc}`).join("\n"),
      );
    else {
      const res = runSlashCommand(t, state);
      if (res?.output) push("info", res.output);
      if (res?.newSessionId) {
        state.sessionId = res.newSessionId;
        refresh();
      }
      if (res?.exit) gracefulExit(0);
    }
  }

  async function runAgent(raw: string) {
    setBusy(true);
    push("user", `you  ${raw}`);
    ac = new AbortController();
    let md = "";
    let thinkItem: Item | null = null;
    try {
      for await (const ev of runTurn(state.sessionId, state.provider, raw, ac.signal)) {
        if (ev.type === "reasoning") {
          if (!thinkItem) {
            thinkItem = { k: nk(), kind: "think", text: ev.delta };
            setItems((prev) => [...prev, thinkItem!]);
          } else {
            const k = thinkItem.k;
            setItems((prev) => prev.map((it) => (it.k === k ? { ...it, text: it.text + ev.delta } : it)));
          }
          stickScroll();
        } else if (ev.type === "text") {
          md += ev.delta;
          setStreamText(md);
          stickScroll();
        } else if (ev.type === "tool_end") {
          if (md) {
            push("md", md);
            md = "";
            setStreamText(null);
          }
          thinkItem = null;
          push("tool", `[m${ev.seq}] ${ev.name} → ${ev.output.replace(/\n/g, " ").slice(0, 200)}`);
        } else if (ev.type === "done") {
          if (ev.reason.startsWith("error")) push("error", ev.reason);
        }
      }
    } catch (e) {
      const msg = (e as Error).message ?? "";
      push("error", ac?.signal.aborted ? "[interrupted]" : `foxc error: ${msg}`);
    } finally {
      if (md) push("md", md);
      setStreamText(null);
      setBusy(false);
      ac = null;
      refresh();
      drainQueue();
    }
  }

  function drainQueue() {
    if (!queued.length) return;
    const next = queued.shift()!;
    setQueuedCount(queued.length);
    void dispatch(next);
  }

  async function dispatch(raw: string) {
    const lit = firstCharLit(); // note: buf cleared before dispatch
    const t = raw.trim();
    if (!t) return;
    if (!lit && t.startsWith("!")) return void runShell(t.slice(1).trim());
    if (!lit && t.startsWith("/")) return runSlash(t);
    await runAgent(raw);
  }

  function chs_set(text: string) {
    setBuf(text.split("").map((x) => ({ c: x, lit: false })).concat([{ c: " ", lit: false }]));
  }

  function submit() {
    const raw = display();
    const lit = firstCharLit();
    setBuf([]);
    const t = raw.trim();
    if (!t) return;

    // slash enter semantics: run exact; unique prefix runs (no-arg) or autocompletes (arg)
    if (!lit && t.startsWith("/") && !t.includes(" ")) {
      const exact = COMMANDS.find((c) => c.name === t);
      if (!exact) {
        const matches = COMMANDS.filter((c) => c.name.startsWith(t));
        const target = matches[Math.min(hintSel(), matches.length - 1)] ?? matches[0];
        if (target) {
          if (ARG_COMMANDS.has(target.name)) {
            // finish the command and add a space for its args
            chs_set(target.name);
            setHintSel(0);
            return;
          }
          void runSlash(target.name);
          setHintSel(0);
          return;
        }
      }
    }

    if (busy()) {
      queued.push(lit ? t : t.replace(/^!/, "\\!").replace(/^\//, "\\/"));
      setQueuedCount(queued.length);
      return;
    }
    void dispatch(raw);
  }

  // ---- keyboard ----

  function App() {
    renderer = useRenderer();
    dimAcc = useTerminalDimensions();

    useKeyboard((key) => {
      if (key.ctrl && key.name === "c") {
        if (busy()) {
          ac?.abort(); // interrupt streaming first
          return;
        }
        // copy ONLY what you selected with the mouse
        let selText = "";
        try {
          const sel = (renderer as any)?.getSelection?.();
          selText = sel?.isActive ? String(sel.getSelectedText?.() ?? "") : "";
        } catch {}
        if (selText.trim()) {
          void clipWrite(selText.replace(/\n\n+/g, "\n"));
          setFlash("copied selection");
        } else {
          setFlash("nothing selected");
        }
        setTimeout(() => setFlash(""), 900);
        return;
      }
      if (key.ctrl && key.name === "d") gracefulExit(0);
      if (key.ctrl && key.name === "t") {
        setShowThink((v) => !v);
        return;
      }

      if (key.name === "escape") {
        if (busy()) {
          ac?.abort();
          return;
        }
        setBuf([]); // esc clears input when idle
        redrawDock();
        return;
      }

      if (key.name === "pageup") {
        stick = false;
        sb?.scrollBy?.(-10);
        return;
      }
      if (key.name === "pagedown") {
        sb?.scrollBy?.(10);
        if ((sb?.scrollTop ?? 0) + 2 >= (sb?.scrollHeight ?? 0)) stick = true;
        return;
      }
      if (key.name === "home") {
        stick = false;
        if (sb) sb.scrollTop = 0;
        return;
      }
      if (key.name === "end") {
        stick = true;
        stickScroll();
        return;
      }

      if (key.name === "return" || key.name === "kpenter" || key.name === "linefeed") {
        const b = buf();
        const last = b[b.length - 1];
        if (last && last.c === "\\" && !last.lit) {
          setBuf([...b.slice(0, -1), { c: "\n", lit: true }]);
        } else {
          submit();
        }
        return;
      }
      if (key.name === "up" || key.name === "down") {
        const d = display();
        if (!firstCharLit() && d.startsWith("/") && !d.includes(" ")) {
          const n = COMMANDS.filter((c) => c.name.startsWith(d)).length;
          if (n > 1) {
            setHintSel((i) => Math.max(0, Math.min(n - 1, i + (key.name === "up" ? -1 : 1))));
          }
          return;
        }
        return;
      }
      if (key.name === "backspace") {
        setBuf((b) => b.slice(0, -1));
        setHintSel(0);
        return;
      }
      if (key.name === "tab" && !firstCharLit() && display().startsWith("/") && !display().includes(" ")) {
        const all = COMMANDS.filter((c) => c.name.startsWith(display()));
        if (all.length) {
          const target = all[Math.min(hintSel(), all.length - 1)];
          chs_set(target.name);
          setHintSel(0);
        }
        return;
      }
      if (key.ctrl && key.name === "v") {
        void clipRead().then((p) => {
          if (!p) return;
          setBuf((b) => [...b, ...p.split("").map((c) => ({ c, lit: false }))]);
        });
        return;
      }

      const seq = (key as any).sequence;
      if (!key.ctrl && !key.meta && typeof seq === "string" && seq.length === 1 && seq >= " ") {
        setBuf((b) => {
          const last = b[b.length - 1];
          if (last && last.c === "\\" && !last.lit) return [...b.slice(0, -1), { c: seq, lit: true }];
          return [...b, { c: seq, lit: false }];
        });
        setHintSel(0);
      }
    });

    const inputLines = () => {
      const b = buf();
      const s = b.map((c) => c.c).join("");
      const lines = s.split("\n");
      lines[lines.length - 1] += "_";
      if (!lines.join("").trim()) lines[0] = "(type here — / commands · \\ escapes · ! shell · shift+pgup scroll)";
      return lines;
    };

    return (
      <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
        {/* full-screen transcript */}
        <scrollbox
          ref={(el: any) => (sb = el)}
          stickyScroll={false}
          viewportCulling={false}
          scrollAcceleration={{ tick: () => 12, reset: () => {} } as any}
          scrollbarOptions={{ showArrows: false, trackOptions: { backgroundColor: "#1a1b26", foregroundColor: "#565f89" } } as any}
          style={{ flexGrow: 1, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
        >
          {createComponent(For, {
            get each() {
              return items();
            },
            children: (it: Item) =>
              it.kind === "md" ? (
                <markdown content={it.text} syntaxStyle={undefined as any} style={{ marginBottom: 1 }} />
              ) : it.kind === "think" ? (
                <Show
                  when={showThink()}
                  fallback={
                    <text fg={C.chrome} onMouseDown={() => setShowThink(true)} style={{ cursor: "pointer" } as any}>
                      ▸ thinking — click or ctrl+t to unfold
                    </text>
                  }
                >
                  <box style={{ flexDirection: "column" }} onMouseDown={() => setShowThink(false)}>
                    <text fg={C.chrome}>▾ thinking (click or ctrl+t to fold)</text>
                    <markdown content={it.text} syntaxStyle={undefined as any} style={{ marginBottom: 1 }} />
                  </box>
                </Show>
              ) : (
                <For each={wrap(it.text, width())}>
                  {(line: string) => (
                    <text fg={it.kind === "user" ? C.user : it.kind === "tool" ? C.tool : it.kind === "error" ? C.error : C.info}>{line}</text>
                  )}
                </For>
              ),
          } as any)}
          <Show when={streamText() !== null}>
            <markdown content={streamText()!} syntaxStyle={undefined as any} style={{ marginBottom: 1 }} />
          </Show>
          <Show when={busy() && streamText() === null}>
            <text fg={C.chrome}>thinking… (esc interrupts)</text>
          </Show>
        </scrollbox>

        {/* bottom dock */}
        <box style={{ flexDirection: "column", height: dockHeight(), paddingLeft: 1, paddingRight: 1 }}>
          {/* slash hints float directly above the dock — zero layout impact */}
          <Show when={hintRows().length > 0}>
            <box
              style={{
                position: "absolute",
                bottom: "100%",
                left: 1,
                flexDirection: "column",
                backgroundColor: "#16161e",
              }}
            >
              <For each={hintRows()}>{(r: Row) => <text fg={r.fg}>{r.text}</text>}</For>
            </box>
          </Show>
          {/* chat box */}
          <box style={{ backgroundColor: "#1f2335", height: inputLineCount(), width: "100%", paddingLeft: 1, paddingRight: 1, flexDirection: "column" }}>
            <For each={inputLineRows()}>
              {(r: Row) => <text fg={r.fg}>{r.text}</text>}
            </For>
          </box>
          <text fg={C.chrome}>{flash() ? `${statusText()} · ${flash()}` : statusText()}</text>
        </box>
      </box>
    );
  }

  interface Row {
    k: number;
    text: string;
    fg: string;
  }

  const HINT_WINDOW = 5;
  const hintRows = (): Row[] => {
    const d = buf().map((c) => c.c).join("");
    if (firstCharLit() || !d.startsWith("/") || d.includes(" ")) return [];
    const matches = COMMANDS.filter((c) => c.name.startsWith(d));
    if (!matches.length) return [];
    const sel = Math.max(0, Math.min(matches.length - 1, hintSel()));
    const start = Math.max(0, Math.min(sel - HINT_WINDOW + 1, matches.length - HINT_WINDOW));
    return matches
      .slice(start, start + HINT_WINDOW)
      .map((c, i) => ({ k: nk(), text: `${c.name.padEnd(12)} ${c.desc}`, fg: start + i === sel ? C.hintSel : C.hint }));
  };

  function dockHeight(): number {
    return inputLineCount() + 1; // chat box + status line — constant
  }

  function inputLineCount(): number {
    const s2 = buf()
      .map((c) => c.c)
      .join("");
    return Math.max(1, s2.split("\n").length);
  }

  const inputLineRows = (): Row[] => {
    const b = buf();
    const s2 = b.map((c) => c.c).join("");
    const lines = s2.split("\n");
    lines[lines.length - 1] += "_";
    if (!lines.join("").trim()) lines[0] = "(type here — / commands · \\ escapes · ! shell · shift+pgup scroll)";
    return lines.map((l) => ({ k: nk(), text: l, fg: C.user }));
  };

  function redrawDock() {
    // touch signals so reactive getters re-run
    setBuf((b) => [...b]);
  }

  getSession(state.sessionId);
  refresh();

  try {
    await render(App, { exitOnCtrlC: false, useMouse: true } as any);
  } catch (e) {
    try {
      (renderer as CliRenderer | null)?.stop?.();
      (renderer as CliRenderer | null)?.destroy?.();
    } catch {}
    throw e;
  }
}
