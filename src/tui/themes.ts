/**
 * TUI themes. One palette type covers both the app and the standalone picker
 * (`fox -c`); presets plus whatever plugins register (`FoxPlugin.themes`).
 *
 * The current theme is module-level and mutable so `/theme` can switch live
 * without a restart: both consumers hold a proxy that resolves every property
 * access against the active palette.
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
    hint: "#565f89",
    error: "#f7768e",
    chrome: "#565f89",
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
    hint: "#a1a6c5",
    error: "#c64343",
    chrome: "#a1a6c5",
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
    hint: "#707070",
    error: "#ffffff",
    chrome: "#707070",
    hintSel: "#ffffff",
    accent: "#e0e0e0",
    ok: "#c0c0c0",
    barBg: "#1a1a1a",
    inputBg: "#242424",
    selBg: "#404040",
  },
  "solarized-dark": {
    fg: "#839496",
    user: "#268bd2",
    tool: "#b58900",
    info: "#2aa198",
    hint: "#586e75",
    error: "#dc322f",
    chrome: "#586e75",
    hintSel: "#93a1a1",
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
    hint: "#6272a4",
    error: "#ff5555",
    chrome: "#6272a4",
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
