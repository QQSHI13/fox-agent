/**
 * TUI themes. One palette type covers both the app and the standalone picker
 * (`fox -c`); presets plus whatever plugins register (`FoxPlugin.themes`).
 *
 * The current theme is module-level and mutable so `/theme` can switch live
 * without a restart: both consumers hold a proxy that resolves every property
 * access against the active palette.
 *
 * Contrast contract: `chrome`/`hint` render the workhorse secondary text
 * (hints, the slash list, queued rows, tool bodies) and must hold >= 4.5:1
 * against BOTH `barBg` and `inputBg`; `fg` >= 4.5 against `inputBg`. The
 * first palettes shipped prettier-but-illegible grays (default's chrome
 * measured 2.5:1, light's 1.8:1) — keep new palettes honest.
 */

export interface Theme {
  fg: string;
  user: string;
  tool: string;
  info: string;
  hint: string;
  error: string;
  chrome: string;
  hintSel: string;
  accent: string;
  ok: string;
  barBg: string;
  inputBg: string;
  selBg: string;
  /** background under tool-call rows (heads + bodies), subtly different from inputBg */
  toolBg: string;
  /** thinking/reasoning blocks — a distinct cool tone, not the tool amber */
  think: string;
}

export const THEME_PRESETS: Record<string, Theme> = {
  default: {
    fg: "#c0caf5",
    user: "#7aa2f7",
    tool: "#e0af68",
    info: "#89ddff",
    // chrome/hint are the workhorse secondary colors (hints, slash list,
    // queued rows, tool bodies) — kept muted but legible: the old #565f89
    // measured 2.5:1 on inputBg, below any readability floor
    hint: "#828ac0",
    error: "#f7768e",
    chrome: "#828ac0",
    hintSel: "#c0caf5",
    accent: "#bb9af7",
    ok: "#9ece6a",
    barBg: "#16161e",
    inputBg: "#1f2335",
    selBg: "#364a82",
    toolBg: "#2a2530",
    think: "#7d8cc4",
  },
  light: {
    fg: "#1f2335",
    user: "#2e7de9",
    tool: "#b15c00",
    info: "#007197",
    hint: "#585e7e",
    error: "#c64343",
    chrome: "#585e7e",
    hintSel: "#1f2335",
    accent: "#7847bd",
    ok: "#587539",
    barBg: "#e4e6f0",
    inputBg: "#dde0ec",
    selBg: "#b6bfe2",
    toolBg: "#e8ddc8",
    think: "#6a6fb8",
  },
  mono: {
    fg: "#d0d0d0",
    user: "#ffffff",
    tool: "#b0b0b0",
    info: "#d0d0d0",
    hint: "#9a9a9a",
    error: "#ffffff",
    chrome: "#9a9a9a",
    hintSel: "#ffffff",
    accent: "#e0e0e0",
    ok: "#c0c0c0",
    barBg: "#1a1a1a",
    inputBg: "#242424",
    selBg: "#404040",
    toolBg: "#383028",
    think: "#a0a0a0",
  },
  "solarized-dark": {
    // base0 body text on base03 measured 4.1:1; base1 keeps the palette and
    // lifts main text to 5.6
    fg: "#93a1a1",
    user: "#268bd2",
    tool: "#b58900",
    info: "#2aa198",
    hint: "#839496",
    error: "#dc322f",
    chrome: "#839496",
    hintSel: "#eee8d5",
    accent: "#6c71c4",
    ok: "#859900",
    barBg: "#002b36",
    inputBg: "#073642",
    selBg: "#094656",
    toolBg: "#0f4a45",
    think: "#6c71c4",
  },
  dracula: {
    fg: "#f8f8f2",
    user: "#8be9fd",
    tool: "#ffb86c",
    info: "#8be9fd",
    hint: "#8794cd",
    error: "#ff5555",
    chrome: "#8794cd",
    hintSel: "#f8f8f2",
    accent: "#bd93f9",
    ok: "#50fa7b",
    barBg: "#21222c",
    inputBg: "#282a36",
    selBg: "#44475a",
    toolBg: "#3a2f3a",
    think: "#8f9cf0",
  },
  // Every preset below was tuned to the same contrast contract as above:
  // every foreground >= 4.5:1 on inputBg, chrome/hint also >= 4.5 on barBg
  // (verified programmatically; see the git history for the audit script).
  nord: {
    fg: "#d8dee9",
    user: "#88b0d4",
    tool: "#ebcb8b",
    info: "#88c0d0",
    hint: "#8f9cbf",
    error: "#d98b93",
    chrome: "#8f9cbf",
    hintSel: "#eceff4",
    accent: "#bf9ab4",
    ok: "#a3be8c",
    barBg: "#242933",
    inputBg: "#2e3440",
    selBg: "#434c5e",
    toolBg: "#3a3648",
    think: "#88a0c8",
  },
  "catppuccin-mocha": {
    fg: "#cdd6f4",
    user: "#89b4fa",
    tool: "#f9e2af",
    info: "#89dceb",
    hint: "#8c93c4",
    error: "#f38ba8",
    chrome: "#8c93c4",
    hintSel: "#cdd6f4",
    accent: "#cba6f7",
    ok: "#a6e3a1",
    barBg: "#181825",
    inputBg: "#1e1e2e",
    selBg: "#414559",
    toolBg: "#33283a",
    think: "#9399d8",
  },
  "gruvbox-dark": {
    fg: "#ebdbb2",
    user: "#83a598",
    tool: "#fabd2f",
    info: "#8ec07c",
    hint: "#b0a48e",
    error: "#fc6b5e",
    chrome: "#b0a48e",
    hintSel: "#ebdbb2",
    accent: "#d3869b",
    ok: "#b8bb26",
    barBg: "#282828",
    inputBg: "#32302f",
    selBg: "#504945",
    toolBg: "#453628",
    think: "#a89984",
  },
  "rose-pine": {
    fg: "#e0def4",
    user: "#9ccfd8",
    tool: "#f6c177",
    info: "#c4a7e7",
    hint: "#a8a3c3",
    error: "#eb6f92",
    chrome: "#a8a3c3",
    hintSel: "#e0def4",
    accent: "#c4a7e7",
    ok: "#6ea8b8",
    barBg: "#191724",
    inputBg: "#1f1d2e",
    selBg: "#403d52",
    toolBg: "#31283f",
    think: "#9ccfd8",
  },
  "tokyo-day": {
    fg: "#343a55",
    user: "#17529e",
    tool: "#8a4a20",
    info: "#00597a",
    hint: "#4d5480",
    error: "#b52a45",
    chrome: "#4d5480",
    hintSel: "#343a55",
    accent: "#7a3ab8",
    ok: "#485e30",
    barBg: "#d5d9e6",
    inputBg: "#e1e4ee",
    selBg: "#c3c9de",
    toolBg: "#e6dcd0",
    think: "#5a6296",
  },
  everforest: {
    fg: "#d3c6aa",
    user: "#7fbbb3",
    tool: "#dbbc7f",
    info: "#83c092",
    hint: "#b0a697",
    error: "#f4908a",
    chrome: "#b0a697",
    hintSel: "#d3c6aa",
    accent: "#d699b6",
    ok: "#a7c080",
    barBg: "#2b3339",
    inputBg: "#343f44",
    selBg: "#4f585e",
    toolBg: "#4a4438",
    think: "#8fa8a0",
  },
};

let current: Theme = THEME_PRESETS.default;
let currentName = "default";
const extra = new Map<string, Theme>();

/** Plugin-registered themes, available alongside the presets. */
export function registerThemes(themes: Record<string, Theme>): void {
  for (const [name, t] of Object.entries(themes)) {
    if (name in THEME_PRESETS) continue; // a plugin may not repaint a preset
    extra.set(name, t);
  }
}

export function themeNames(): string[] {
  return [...Object.keys(THEME_PRESETS), ...extra.keys()];
}

export function theme(): Theme {
  return current;
}
export function themeName(): string {
  return currentName;
}

/** Switch by name; false when the name is unknown (the caller reports it). */
export function setTheme(name: string): boolean {
  const t = THEME_PRESETS[name] ?? extra.get(name);
  if (!t) return false;
  current = t;
  currentName = name;
  return true;
}

/**
 * A live view of the active theme: every property get resolves against whatever
 * theme is current *now*, so a `/theme` switch repaints without a restart.
 */
export function liveTheme<T extends string>(map?: Partial<Record<T, keyof Theme>>): Record<T, string> {
  return new Proxy({} as Record<T, string>, {
    get: (_, key: T) => {
      const k = (map?.[key] ?? key) as keyof Theme;
      return current[k];
    },
  });
}
