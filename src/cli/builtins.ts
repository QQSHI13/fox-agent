/**
 * The built-in CLI commands, registered into the table in `registry.ts`.
 *
 * Each command owns its own name, aliases, summary, help text and behavior —
 * adding a command means adding an entry HERE, not editing `cli.ts`.
 */
import { registerCommand, type CliCommand } from "./registry.ts";
import { errMsg } from "../core/errors.ts";
import { join } from "node:path";
import { VERSION } from "../core/version.ts";

// NOTE: nothing heavy is imported at module scope. This module is loaded by the
// ENTRY (cli.ts) to populate the command table, so a static `../store/db.ts`
// here would pull bun:sqlite into every `fox --version` run — the exact cost the
// entry/app split exists to avoid. The store and config load inside each run().

/**
 * commands.ts is loaded lazily: it pulls the TUI-facing command surface in, and
 * `fox --version` must not pay for it. The registry's own module stays light.
 */
async function cmds() {
  return await import("../commands.ts");
}

/** `fox <cmd> --help` — the shared guard every command uses. */
function wantsHelp(args: string[]): boolean {
  return args[0] === "--help" || args[0] === "-h";
}

const pluginCmd: CliCommand = {
  name: "plugin",
  aliases: ["plugins"],
  summary: "manage plugins without the TUI",
  help: `usage: fox plugin [on|off|add|rm|info <name>]

list plugins and switch them on/off without entering the TUI.
Names accept the short form (pty), the full form (bundled:pty), the
plugin's own name, or the configured path. (Also: fox plugins, /plugin.)`,
  async run({ args, flags }) {
    if (wantsHelp(args)) {
      console.log(pluginCmd.help);
      return;
    }
    // plugin management without entering the TUI — same inventory and
    // verbs the /plugin slash command works through, in terminal colors
    try {
      const { cliColor, pluginAddPath, pluginInfoText, pluginListText, pluginRemovePath, pluginSetEnabled } = await cmds();
      const { loadConfig, effectiveConfigPath } = await import("../core/config.ts");
      const flagPath = (flags.get("config") as string) || undefined;
      const configPath = effectiveConfigPath(flagPath);
      const pcfg = loadConfig({ cwd: process.cwd(), configPath });
      const [sub, ...words] = args;
      const name = words.join(" ");
      const color = cliColor();
      const ctx = { config: pcfg, configPath, color };
      const out =
        (sub === "on" || sub === "off") && name
          ? await pluginSetEnabled(ctx, name, sub === "on")
          : sub === "add" && name
            ? await pluginAddPath(ctx, name)
            : (sub === "rm" || sub === "remove" || sub === "uninstall") && name
              ? await pluginRemovePath(ctx, name)
              : sub === "info" && name
                ? await pluginInfoText(ctx, name)
                : sub === undefined
                  ? await pluginListText(ctx)
                  : "usage: fox plugin [on|off|add|rm|info <name>]";
      console.log(out);
    } catch (e) {
      console.error(`fox-agent error: ${errMsg(e)}`);
      process.exitCode = 1;
    }
  },
};

const lsCmd: CliCommand = {
  name: "ls",
  summary: "list sessions",
  help: `usage: fox ls

list sessions, most recently worked-in first, across all directories.
Pass an index to resume it: fox -c 2 (or fox -c <id>).`,
  async run({ args }) {
    if (wantsHelp(args)) {
      console.log(lsCmd.help);
      return;
    }
    // same renderer the TUI and `/sessions` use, so a session that looks stale
    // here looks stale there too — this used to be its own loop over
    // `created_at` and disagreed with every other listing about ordering
    const { cliColor, formatSessionList, sessionList } = await cmds();
    const { loadConfig } = await import("../core/config.ts");
    console.log(formatSessionList(sessionList({ limit: loadConfig({ cwd: process.cwd() }).sessionListLimit }), { color: cliColor() }));
  },
};

const shareCmd: CliCommand = {
  name: "share",
  summary: "render this session as one offline HTML file",
  help: `usage: fox share [file]

render a session as a single offline HTML file you can open anywhere.`,
  async run({ args }) {
    if (wantsHelp(args)) {
      console.log(shareCmd.help);
      return;
    }
    try {
      const { shareSession } = await import("../store/share.ts");
      const { latestSessionFor } = await import("../store/db.ts");
      const target = args[0] === "current" || !args[0] ? latestSessionFor(process.cwd())?.id : args[0];
      if (!target) return console.log(`no session found for ${process.cwd()}`);
      const out = args[1] || join(process.cwd(), `fox-session-${target}.html`);
      const r = shareSession(target, out);
      console.log(`shared ${target} -> ${r.path} (${(r.bytes / 1024).toFixed(0)} KB, ${r.messages} messages)`);
    } catch (e) {
      console.error(`fox-agent error: ${errMsg(e)}`);
      process.exitCode = 1;
    }
  },
};

const exportCmd: CliCommand = {
  name: "export",
  summary: "pack a session into a .zip to move to another device",
  help: `usage: fox export <session-id|current> [file]

pack a session's database into a .fox.zip you can move to any device
with fox-agent (scp, syncthing, a usb stick). Inside fox the same
command is /export. Import on the other machine: fox import <file>.`,
  async run({ args }) {
    if (wantsHelp(args) || !args[0]) {
      console.log(exportCmd.help);
      return;
    }
    const { exportSession } = await import("../store/transfer.ts");
    const { latestSessionFor } = await import("../store/db.ts");
    try {
      // "current" = this directory's latest session (the one `fox -c` resumes)
      const target = args[0] === "current" ? latestSessionFor(process.cwd())?.id : args[0];
      if (!target) return console.log(`no session found for ${process.cwd()}`);
      const dest = await exportSession(target, args[1] || undefined, VERSION);
      console.log(`exported ${target} -> ${dest}`);
    } catch (e) {
      console.error(`fox-agent error: ${errMsg(e)}`);
      process.exitCode = 1;
    }
  },
};

const importCmd: CliCommand = {
  name: "import",
  summary: "install a session .zip from another device",
  help: `usage: fox import <file.zip>

install a session exported from another device. It lands under its
own id and appears in fox ls / fox -c like a local session; an
existing session with the same id is replaced. Inside fox: /import.`,
  async run({ args }) {
    if (wantsHelp(args) || !args[0]) {
      console.log(importCmd.help);
      return;
    }
    const { importSession } = await import("../store/transfer.ts");
    try {
      const r = await importSession(args[0]);
      console.log(`${r.replaced ? "replaced" : "imported"} session ${r.id} (${r.messages} messages) — resume with: fox -c ${r.id}`);
    } catch (e) {
      console.error(`fox-agent error: ${errMsg(e)}`);
      process.exitCode = 1;
    }
  },
};

const upgradeCmd: CliCommand = {
  name: "upgrade",
  summary: "self-update from GitHub releases",
  help: `usage: fox upgrade [--beta|<version>]

bare: latest stable release; beta: newest release including betas;
a version installs that tag (e.g. fox upgrade 0.5.0-beta.1).
Downloads are SHA-256 verified; the previous binary is kept as .fox-previous.
GitHub API rate limits apply — set GITHUB_TOKEN (or GH_TOKEN) to raise them.`,
  async run({ args }) {
    if (wantsHelp(args)) {
      console.log(upgradeCmd.help);
      return;
    }
    const sel = args[0];
    const opts: import("../core/upgrade.ts").UpgradeOptions =
      sel === "--beta" || sel === "beta" ? { beta: true }
      : sel ? { to: sel.replace(/^v/, "") }
      : {};
    try {
      const { upgrade } = await import("../core/upgrade.ts");
      const r = await upgrade(opts, console.log);
      console.log(r.changed ? `upgraded to v${r.version} — restart fox to run it` : `already on v${r.version}`);
    } catch (e) {
      console.error(`fox-agent error: ${errMsg(e)}`);
      process.exitCode = 1;
    }
  },
};

/** Register the built-in commands. Called once at startup. */
export function registerBuiltins(): void {
  for (const c of [pluginCmd, lsCmd, shareCmd, exportCmd, importCmd, upgradeCmd]) registerCommand(c);
}
