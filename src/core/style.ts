/**
 * Cell style: the shared vocabulary of "how a character looks" on screen.
 *
 * Lives in core (not tui/screen.ts) because plugins and providers need the
 * type without importing the whole screen/grid module — the same reason
 * `Tool`/`ToolResult` live in core/tool.ts. The screen module re-exports it
 * so existing `import { type Style } from "./screen.ts"` keeps working.
 */
export interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  /** faint / dim intensity: SGR 2 on, 22 (or 0) off */
  faint?: boolean;
  italic?: boolean;
  /** strikethrough: SGR 9 on, 29 off */
  strike?: boolean;
  /** OSC 8 hyperlink target; empty string ends a hyperlink */
  href?: string;
}
