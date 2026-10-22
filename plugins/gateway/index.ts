/**
 * Gateway plugin — `fox gateway [--port N]`. An ON-DISK plugin: its server
 * (server.ts) and UI (ui.html) live beside this entry and are loaded at
 * runtime, deliberately NOT part of the compiled binary.
 *
 * Serves a WebSocket gateway with a chat UI at TUI parity: streaming markdown,
 * expandable tool-call cards, thinking blocks, and cancel. The engine comes
 * from the host API (`globalThis.foxHost`), so the plugin never imports the
 * harness's internals — a compiled binary has no `src/` beside it.
 */
export const name = "gateway";
export const description = "web chat UI at TUI parity — fox gateway [--port N]";

export const cliCommand = {
  name: "gateway",
  description: "web chat UI at TUI parity (streaming markdown, tool cards, thinking, cancel)",
  run: async (args: string[], ctx: { config: unknown; provider: unknown; flags?: Map<string, string | boolean> }) => {
    const { runGateway } = await import("./server.ts");
    const flagPort = ctx.flags?.get("port");
    const portIdx = args.indexOf("--port");
    const port =
      (typeof flagPort === "string" ? Number(flagPort) : 0) ||
      (portIdx >= 0 ? Number(args[portIdx + 1]) : 0) ||
      Number(args.find((a) => /^\d+$/.test(a)) ?? 0) ||
      0;
    await runGateway({ port, hostname: "127.0.0.1" });
  },
};
