/**
 * The `lsp` tool — on-demand navigation queries against the project's language
 * server (opencode's experimental pattern). Diagnostics already flow to the
 * model automatically after edits; this tool is for the OTHER direction:
 * "where is this defined", "who calls it", "what is this symbol" — questions
 * grep answers badly (same-name symbols, re-exports, type positions).
 *
 * Env-gated OFF by default (FOX_AGENT_ENABLE_LSP_TOOL=1), matching opencode's
 * stance: LSP is a net negative on some projects (server drift, cold-start
 * cost, version skew), and the model can always fall back to grep. When the
 * flag is set AND a server exists for the file, this is the sharpest
 * navigation instrument the harness has.
 */
import type { Tool } from "./types.ts";
import type { ToolDef } from "../providers/types.ts";
import { ok, fail } from "./types.ts";
import { relative } from "node:path";
import * as nav from "../lsp/client.ts";

export const lspEnabled = () => process.env.FOX_AGENT_ENABLE_LSP_TOOL === "1";

export const lspDef: ToolDef = {
  name: "lsp",
  description:
    "Language-server navigation: exact definition/reference/hover/symbol lookups for the file's language (TypeScript, Python, Rust built in; [lsp.*] config adds more). Sharper than grep for finding where a symbol is DEFINED vs mentioned, or every real call site. Each query is one of: definition|implementation|references|hover|symbols (file outline)|workspace (project-wide symbol search). Position args are 1-based line/character, matching read/grep output. Answers come from a real language server: first query may take seconds (cold start), later ones are fast. Only enabled when FOX_AGENT_ENABLE_LSP_TOOL=1.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", enum: ["definition", "implementation", "references", "hover", "symbols", "workspace"], description: "kind of lookup" },
      file: { type: "string", description: "the file to query (any file of the project for query=workspace)" },
      line: { type: "number", description: "1-based line of the symbol (not needed for symbols/workspace)" },
      character: { type: "number", description: "1-based column of the symbol" },
      name: { type: "string", description: "workspace only: symbol name to search" },
      includeDeclaration: { type: "boolean", description: "references only: include the declaration site" },
    },
    required: ["query", "file"],
  },
};

function relPath(cwd: string, file: string): string {
  return relative(cwd, file) || file;
}

function renderLocations(cwd: string, label: string, locs: nav.LspLocation[] | null): string {
  if (locs === null) return `${label}: no language server for this file (or the server failed to start)`;
  if (!locs.length) return `${label}: no results`;
  const MAX = 30;
  const lines = locs.slice(0, MAX).map((l) => `${relPath(cwd, l.file)}:${l.line}:${l.character}`);
  const more = locs.length > MAX ? `\n… (+${locs.length - MAX} more)` : "";
  return `${label} (${locs.length}):\n${lines.join("\n")}${more}`;
}

export async function lspRun(args: any, ctx: import("./types.ts").ToolContext): Promise<import("./types.ts").ToolResult> {
  const q: string = args?.query;
  const file: string = args?.file;
  if (!q || !file) return fail("error: query and file are required");
  if (!lspEnabled()) {
    return fail("error: the lsp tool is disabled — set FOX_AGENT_ENABLE_LSP_TOOL=1 to enable it (or use grep/read)");
  }
  const opts = { cwd: ctx.cwd };
  const at = { line: Number(args?.line ?? 1), character: Number(args?.character ?? 1) };

  switch (q) {
    case "definition": {
      const locs = await nav.definition(file, at);
      return ok(renderLocations(ctx.cwd, "definition", locs));
    }
    case "implementation": {
      const locs = await nav.implementation(file, at);
      return ok(renderLocations(ctx.cwd, "implementation", locs));
    }
    case "references": {
      const locs = await nav.references(file, at, { includeDeclaration: args?.includeDeclaration === true });
      return ok(renderLocations(ctx.cwd, "references", locs));
    }
    case "hover": {
      const h = await nav.hover(file, at);
      if (!h) return ok("hover: nothing (no server, or no symbol at that position)");
      return ok(`hover:\n${h.text.slice(0, 2000)}`);
    }
    case "symbols": {
      const syms = await nav.documentSymbols(file);
      if (syms === null) return ok("symbols: no language server for this file (or the server failed to start)");
      if (!syms.length) return ok("symbols: none found");
      const MAX = 80;
      const lines = syms.slice(0, MAX).map((s) => `${s.kind.padEnd(12)} ${s.name}  (${relPath(ctx.cwd, file)}:${s.line})`);
      const more = syms.length > MAX ? `\n… (+${syms.length - MAX} more)` : "";
      return ok(`symbols (${syms.length}):\n${lines.join("\n")}${more}`);
    }
    case "workspace": {
      const name: string = args?.name;
      if (!name) return fail("error: query=workspace needs 'name' (symbol to search)");
      const syms = await nav.workspaceSymbols(name, file);
      if (syms === null) return ok("workspace: no language server for this file (or the server failed to start)");
      if (!syms.length) return ok(`workspace: no symbols matching '${name}'`);
      const MAX = 40;
      const lines = syms.slice(0, MAX).map((s) => `${s.kind.padEnd(12)} ${s.name}  ${relPath(ctx.cwd, s.file ?? file)}:${s.line}`);
      const more = syms.length > MAX ? `\n… (+${syms.length - MAX} more)` : "";
      return ok(`workspace symbols matching '${name}' (${syms.length}):\n${lines.join("\n")}${more}`);
    }
    default:
      return fail(`error: unknown query '${q}'`);
  }
}

export const lspPlugin: import("../plugins/types.ts").FoxPlugin = {
  name: "bundled:lsp",
  tools: [{ def: lspDef, run: lspRun }],
};
