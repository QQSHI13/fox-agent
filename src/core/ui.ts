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
  /**
   * select: offer an answer that is not in `options` too. An "other…" row is
   * appended to the list (never filtered away — it is how you reach a value
   * no filter can match), and choosing it swaps the dock to a free-text box
   * for this step; whatever is typed becomes the answer.
   *
   * Off by default: a closed list is a promise the command can rely on. Turn
   * it on where the handler validates what it gets back anyway.
   */
  custom?: boolean;
  /** text prefill, or the select value to start on; may also depend on earlier answers */
  initial?: string | ((answers: Record<string, string>) => string | undefined);
  /** dim suffix, e.g. "empty = keep current"; may also depend on earlier answers */
  hint?: string | ((answers: Record<string, string>) => string | undefined);
  /** mask typed characters (api keys) */
  secret?: boolean;
  /** default true; when false an empty answer flashes and stays on the step */
  allowEmpty?: boolean;
  /** when this returns true the wizard skips the step entirely (conditional questions) */
  skipIf?: (answers: Record<string, string>) => boolean;
}

/** Resolve a possibly-dynamic step field against the answers so far. */
export function resolveField<T>(field: T | ((answers: Record<string, string>) => T) | undefined, answers: Record<string, string>): T | undefined {
  return typeof field === "function" ? (field as (a: Record<string, string>) => T)(answers) : field;
}

/**
 * The synthetic row a `custom` select step appends to its options.
 *
 * Its value is a sentinel, never an answer: choosing it opens a free-text box
 * for the step, and whatever is typed there is committed instead. The sentinel
 * exists so the wizard can tell the row apart from real options — a command
 * that ends up holding it was handed something the user never chose.
 */
export const CUSTOM_OPTION = { value: "__fox_other__", label: "other…" };

/** Is this option the custom-answer row? */
export function isCustomOption(option: { value: string } | undefined): boolean {
  return option !== undefined && option.value === CUSTOM_OPTION.value;
}

/**
 * What a select step paints: its options narrowed by the typed filter, plus
 * the custom row when the step allows one.
 *
 * The custom row is appended *after* filtering and deliberately does not match
 * the filter. It is the one row that has to survive a query matching nothing
 * else — "type whatever you want" must stay reachable precisely when every
 * listed option has been filtered away.
 */
export function visibleOptions(
  options: { value: string; label: string }[],
  filter: string,
  custom: boolean,
): { value: string; label: string }[] {
  const f = filter.trim().toLowerCase();
  const shown = !f ? options : options.filter((o) => o.label.toLowerCase().includes(f) || o.value.toLowerCase().includes(f));
  return custom ? [...shown, CUSTOM_OPTION] : shown;
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
