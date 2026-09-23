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
