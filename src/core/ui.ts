/**
 * The host-UI question protocol, shared by slash commands and plugin tools.
 *
 * A command returns steps for the host to walk through (see `PromptRequest` in
 * commands.ts); a plugin tool gets a `UiBridge` on its `ToolContext` and can
 * await answers mid-run. Both describe questions with the same `UiStep`, so
 * the TUI implements the interaction exactly once — text in the input dock,
 * selects as an option list, secrets masked — and every consumer gets it.
 *
 * Hosts that cannot take over the keyboard (plain mode, `-p`, ACP) simply
 * never set the bridge and never receive a prompt request; commands keep
 * their printed/argument forms for them.
 */

/** One question in a wizard. */
export interface UiStep {
  /** the answers-map key the caller reads */
  key: string;
  /** shown as the input prompt, e.g. "api key" */
  label: string;
  kind: "text" | "select";
  /**
   * select: the choices; `value` is what the answers map gets, `label` what
   * the user sees. May be a function of the answers collected so far, so a
   * later step can offer choices that depend on an earlier one (a model list
   * for the provider just picked, say).
   */
  options?: { value: string; label: string }[] | ((answers: Record<string, string>) => { value: string; label: string }[]);
  /** text prefill, or the select value to start on; may also depend on earlier answers */
  initial?: string | ((answers: Record<string, string>) => string | undefined);
  /** dim suffix, e.g. "empty = keep current"; may also depend on earlier answers */
  hint?: string | ((answers: Record<string, string>) => string | undefined);
  /** mask typed characters (api keys) */
  secret?: boolean;
  /** default true; when false an empty answer flashes and stays on the step */
  allowEmpty?: boolean;
}

/** Resolve a possibly-dynamic step field against the answers so far. */
export function resolveField<T>(field: T | ((answers: Record<string, string>) => T) | undefined, answers: Record<string, string>): T | undefined {
  return typeof field === "function" ? (field as (a: Record<string, string>) => T)(answers) : field;
}

/**
 * Questions a running tool can ask the user, when the host is interactive.
 *
 * Every method resolves to `undefined` when the user cancels (escape) — a tool
 * must treat that as "aborted by user", not as an empty answer. The bridge is
 * absent entirely on non-interactive hosts, so a tool that needs an answer to
 * proceed should say so in its output rather than block.
 */
export interface UiBridge {
  /** pick one option; resolves to its `value` */
  select(title: string, options: { value: string; label?: string }[], opts?: { initial?: string }): Promise<string | undefined>;
  /** one line of free text */
  input(title: string, opts?: { initial?: string; hint?: string; secret?: boolean; allowEmpty?: boolean }): Promise<string | undefined>;
  /** a full multi-step wizard; resolves to the answers map */
  wizard(title: string, steps: UiStep[]): Promise<Record<string, string> | undefined>;
}
