import { test, expect, afterEach } from "bun:test";
import { THEME_PRESETS, liveTheme, registerThemes, setTheme, theme, themeName, themeNames, type Theme } from "../src/tui/themes.ts";

afterEach(() => setTheme("default"));

test("every preset defines the full palette", () => {
  const keys: (keyof Theme)[] = ["fg", "user", "tool", "info", "hint", "error", "chrome", "hintSel", "accent", "ok", "barBg", "inputBg", "selBg"];
  for (const [name, t] of Object.entries(THEME_PRESETS)) {
    for (const k of keys) expect(t[k], `${name}.${k}`).toMatch(/^#[0-9a-f]{6}$/i);
  }
});

test("setTheme switches by name and rejects unknown ones", () => {
  expect(setTheme("dracula")).toBe(true);
  expect(themeName()).toBe("dracula");
  expect(theme()).toBe(THEME_PRESETS.dracula);
  expect(setTheme("no-such-theme")).toBe(false);
  expect(themeName()).toBe("dracula"); // a miss leaves the current theme alone
});

test("liveTheme follows a switch without being recreated", () => {
  const C = liveTheme<"fg" | "accent">();
  const before = C.fg;
  setTheme("mono");
  expect(C.fg).toBe(THEME_PRESETS.mono.fg);
  expect(C.accent).toBe(THEME_PRESETS.mono.accent);
  expect(C.fg).not.toBe(before);
});

test("liveTheme's key map renames picker keys onto theme keys", () => {
  const C = liveTheme<"dim" | "warn">({ dim: "hint", warn: "error" });
  expect(C.dim).toBe(THEME_PRESETS.default.hint);
  expect(C.warn).toBe(THEME_PRESETS.default.error);
});

test("registerThemes adds names but cannot repaint a preset", () => {
  const mine: Theme = { ...THEME_PRESETS.default, fg: "#123456" };
  registerThemes({ "my-theme": mine, default: { ...THEME_PRESETS.default, fg: "#000000" } });
  expect(themeNames()).toContain("my-theme");
  expect(setTheme("my-theme")).toBe(true);
  expect(theme().fg).toBe("#123456");
  expect(THEME_PRESETS.default.fg).not.toBe("#000000");
});

// ---- the dock's two markers -------------------------------------------------
// The wizard shares the input box with the normal prompt, so it shares the
// GLYPH; only the color distinguishes it. These pin both halves of that rule.

const srgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = srgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** OKLab distance: one perceptual number for "do these two colors differ". */
const oklab = (hex: string) => {
  const [r, g, b] = srgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
const distance = (a: string, b: string) => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

test("every preset colors the wizard arrow distinctly from the other dock markers", () => {
  // A wizard marker that matched grey/normal text would be invisible as a
  // state; one that matched the slash or shell marker would claim a mode the
  // dock is not in. And matching `prompt` would defeat the whole point — the
  // glyph is identical, so the color is the ONLY signal.
  for (const [name, t] of Object.entries(THEME_PRESETS)) {
    const w = t.wizard;
    expect(w, `${name}.wizard`).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(w!, t.inputBg), `${name}: wizard on inputBg`).toBeGreaterThanOrEqual(4.5);
    for (const other of ["hint", "fg", "cmd", "shell", "prompt"] as const) {
      expect(distance(w!, t[other]!), `${name}: wizard vs ${other}`).toBeGreaterThan(0.09);
    }
  }
});
