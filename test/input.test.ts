import { describe, expect, test } from "bun:test";
import { createInputModule, type InputModule } from "../src/tui/input.ts";

function inputFor(text: string, width = 20): InputModule {
  let mod: InputModule;
  mod = createInputModule({
    display: () => text,
    isSecret: () => false,
    width: () => width,
    markDirty: () => {},
    dockGeom: () => ({ layout: mod.inputLayout(), firstShown: 0, inputTop: 0, shownCount: 8 }),
  });
  return mod;
}

describe("input module caret geometry", () => {
  // Regression: a logical line that fills the full wrap width and then has a
  // space used to drop that space onto a second row with startCol one past the
  // first row's width. The caret before the wrapped space then computed
  // colW = -1 and painted left of the prompt arrow. The editor wrap is lossless:
  // the space is the first cell of the next visual row.
  test("caret at a full-width wrap stays inside the input box", () => {
    const text = "aaaaaaaaaaaaaaaa bb";
    const mod = inputFor(text);
    const layout = mod.inputLayout();

    expect(layout.rows.map((r) => [r.text, r.startCol, r.rowW])).toEqual([
      ["aaaaaaaaaaaaaaaa", 0, 16],
      [" bb", 16, 3],
    ]);
    expect(mod.caretPos(layout, 16)).toEqual({ visRow: 1, colW: 0 });
    expect(mod.caretPos(layout, 17)).toEqual({ visRow: 1, colW: 1 });
    expect(mod.caretPos(layout, 19)).toEqual({ visRow: 1, colW: 3 });
  });
});
