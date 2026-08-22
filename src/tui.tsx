// foxc TUI — @opentui/solid, line-list architecture
// NOTE: bun's JSX transform is react-style (no solid babel preset), so nothing
// inside JSX may be dynamic. All dynamics go through one `rows` signal whose
// item identity changes drive <For> reconciliation.
import { render, useKeyboard } from "@opentui/solid";
import { createSignal, createComponent, For } from "solid-js";
import { getSession, sessionUsage } from "./store/db.ts";
import { projectView, viewTokenEstimate } from "./loop/context.ts";
import { runTurn } from "./loop/agent.ts";
import { runSlashCommand, SLASH_HELP, type HarnessState } from "./commands.ts";

interface Row {
  k: number;
  text: string;
  fg: string;
}

const C = {
  user: "#7aa2f7",
  assistant: "#c0caf5",
  tool: "#e0af68",
  info: "#565f89",
  error: "#f7768e",
  summary: "#9ece6a",
  chrome: "#565f89",
  accent: "#bb9af7",
};

let keySeq = 0;
const nk = () => ++keySeq;

export async function startTui(state: HarnessState) {
  const [rows, setRows] = createSignal<Row[]>([]);
  const [busy, setBusy] = createSignal(false);
  let buf = "";
  let streamingRow: Row | null = null;

  function oneLine(s: string, n = 150): string {
    const t = s.replace(/\n/g, " ");
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function statusText(): string {
    try {
      const u = sessionUsage(state.sessionId);
      const nodes = projectView(state.sessionId);
      const vis = nodes.filter((n) => !n.deleted).length;
      return `${vis}/${nodes.length} nodes · ~${viewTokenEstimate(nodes)} est tok · ${u.prompt + u.completion} tok used`;
    } catch {
      return "";
    }
  }

  function transcriptRows(): Row[] {
    return projectView(state.sessionId)
      .filter((n) => !n.deleted && (n.content || n.summary))
      .slice(-300)
      .map((n): Row => {
        if (n.msg.role === "user") return { k: nk(), text: `[m${n.msg.seq}] you  ${oneLine(n.content)}`, fg: C.user };
        if (n.msg.role === "tool")
          return { k: nk(), text: `[m${n.msg.seq}] tool ${oneLine(n.content)}`, fg: C.tool };
        return { k: nk(), text: `[m${n.msg.seq}] foxc ${oneLine(n.content || "(tool call)")}`, fg: C.assistant };
      });
  }

  // rows layout: header / blank / transcript… / status / input
  function redraw(extra: Row[] = []) {
    const base: Row[] = [
      { k: nk(), text: `foxc  ${state.sessionId} · ${state.provider.model}`, fg: C.accent },
      { k: nk(), text: "", fg: C.chrome },
      ...transcriptRows(),
      ...extra,
      { k: nk(), text: statusText(), fg: C.chrome },
      { k: nk(), text: busy() ? "thinking…" : buf ? `${buf}_` : "(type /help for commands)", fg: busy() ? C.chrome : C.user },
    ];
    setRows(base);
  }

  function bottomRow(): Row {
    return { k: nk(), text: busy() ? "thinking…" : buf ? `${buf}_` : "(type /help for commands)", fg: busy() ? C.chrome : C.user };
  }

  function pushLine(text: string, fg: string) {
    // insert above status/input (3 fixed bottom rows); multi-line text becomes one row per line
    setRows((prev) => {
      const head = prev.slice(0, -3);
      const newRows = text.split("\n").map((l) => ({ k: nk(), text: l.length ? l : " ", fg }));
      return [...head, ...newRows, bottomRow()];
    });
  }

  async function submit(text: string) {
    const t = text.trim();
    if (!t || busy()) return;

    if (t.startsWith("/")) {
      if (t === "/help" || t === "/?") {
        pushLine(SLASH_HELP, C.info);
        return;
      }
      const res = runSlashCommand(t, state);
      if (res?.handled) {
        if (res.output) pushLine(res.output, C.info);
        if (res.newSessionId) {
          state.sessionId = res.newSessionId;
          redraw();
        }
        if (res.exit) process.exit(0);
        return;
      }
    }

    setBusy(true);
    redraw();
    pushLine(`you  ${t}`, C.user);

    try {
      for await (const ev of runTurn(state.sessionId, state.provider, t)) {
        if (ev.type === "text") {
          if (!streamingRow) {
            pushLine(`foxc ${""}`, C.assistant);
            const head = rows().slice(0, -3);
            streamingRow = head[head.length - 1] ?? null;
          }
          if (streamingRow) {
            streamingRow.text += ev.delta.replace(/\n/g, " ");
            const i = rows().findIndex((r) => r.k === streamingRow!.k);
            if (i >= 0) setRows((prev) => [...prev.slice(0, i), { ...streamingRow! }, ...prev.slice(i + 1)]);
          }
        } else if (ev.type === "tool_end") {
          streamingRow = null;
          pushLine(`[m${ev.seq}] tool ${ev.name} → ${ev.output.replace(/\n/g, " ").slice(0, 120)}`, C.tool);
        } else if (ev.type === "done" && ev.reason.startsWith("error")) {
          streamingRow = null;
          pushLine(ev.reason, C.error);
        }
      }
    } catch (e) {
      pushLine(`foxc error: ${(e as Error).message}`, C.error);
    } finally {
      streamingRow = null;
      setBusy(false);
      redraw();
    }
  }

  function App() {
    useKeyboard((key) => {
      if (key.ctrl && key.name === "c") process.exit(0);
      if (busy()) return;
      if (key.name === "return" || key.name === "kpenter" || key.name === "linefeed") {
        const v = buf.trim();
        buf = "";
        void submit(v);
        return;
      }
      if (key.name === "backspace") {
        buf = buf.slice(0, -1);
        redraw();
        return;
      }
      const seq = (key as any).sequence;
      if (!key.ctrl && !key.meta && typeof seq === "string" && seq.length === 1 && seq >= " ") {
        buf += seq;
        // cheap visual echo: rewrite just the input row
        setRows((prev) => [...prev.slice(0, -1), { k: nk(), text: `${buf}_`, fg: C.user }]);
      }
    });

    return (
      <box style={{ flexDirection: "column", width: "100%", height: "100%", paddingLeft: 1, paddingRight: 1 }}>
        <scrollbox style={{ flexGrow: 1, flexDirection: "column" }}>
          {createComponent(For, {
            get each() {
              return rows();
            },
            children: (r: Row) => <text fg={r.fg}>{r.text}</text>,
          } as any)}
        </scrollbox>
      </box>
    );
  }

  getSession(state.sessionId);
  redraw();
  await render(App);
}
