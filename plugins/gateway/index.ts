/**
 * Gateway plugin — `fox gateway [--port N]`. An ON-DISK plugin: its UI
 * (ui.html) and this entry live in plugins/gateway/, loaded at runtime and
 * deliberately NOT part of the compiled binary.
 *
 * Serves a WebSocket gateway with a real chat UI at TUI parity: streaming
 * markdown, expandable tool-call cards, thinking blocks, and cancel. Turns run
 * in-process via runTurnCore (the same engine as the TUI).
 */
export const name = "gateway";
export const description = "web chat UI at TUI parity — fox gateway [--port N]";

export const cliCommand = {
  name: "gateway",
  description: "web chat UI at TUI parity (streaming markdown, tool cards, thinking, cancel)",
  run: async (args: string[], ctx: { config: unknown; provider: unknown; flags?: Map<string, string | boolean> }) => {
    const { runGateway } = await import("../../src/gateway/server.ts");
    const flagPort = ctx.flags?.get("port");
    const portIdx = args.indexOf("--port");
    const port =
      (typeof flagPort === "string" ? Number(flagPort) : 0) ||
      (portIdx >= 0 ? Number(args[portIdx + 1]) : 0) ||
      Number(args.find((a) => /^\d+$/.test(a)) ?? 0) ||
      0;
    await runGateway({
      config: ctx.config as never,
      provider: ctx.provider as never,
      port,
      hostname: "127.0.0.1",
    });
  },
};
