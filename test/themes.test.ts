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
