import { describe, expect, test } from "bun:test";
import { Picker, type PickerRow } from "../src/tui/picker.ts";

function rows(...ids: string[]): PickerRow[] {
  return ids.map((id) => ({ id, cells: [id], search: id }));
}

const ALL = { title: "t", allowNew: true, allowDelete: true, allowFork: true };

describe("picker selection", () => {
  test("arrows wrap, and an empty list has no selection to move", () => {
    const p = new Picker(rows("a", "b", "c"), ALL);
    expect(p.selected()!.id).toBe("a");
    p.key({ name: "down" });
    expect(p.selected()!.id).toBe("b");
    p.key({ name: "up" });
    p.key({ name: "up" });
    expect(p.selected()!.id).toBe("c"); // wrapped past the top
    p.key({ name: "down" });
    expect(p.selected()!.id).toBe("a");

    const empty = new Picker([], ALL);
    expect(empty.selectedIndex()).toBe(-1);
    expect(empty.selected()).toBeUndefined();
    expect(empty.key({ name: "down" })).toBeNull();
    expect(empty.key({ name: "return" })).toBeNull(); // nothing to choose
  });

  test("home/end/page move within bounds", () => {
    const p = new Picker(rows("a", "b", "c", "d", "e", "f", "g", "h"), ALL);
    p.key({ name: "end" });
    expect(p.selected()!.id).toBe("h");
    p.key({ name: "pageup" });
    expect(p.selected()!.id).toBe("c");
    p.key({ name: "pagedown" });
    expect(p.selected()!.id).toBe("h"); // clamped, not wrapped
    p.key({ name: "home" });
    expect(p.selected()!.id).toBe("a");
  });

  test("a selection past the end of a narrowed list still points at a visible row", () => {
    // the bug this guards: filter down to fewer rows than the stored index and
    // the highlight paints on nothing while enter chooses undefined
    const p = new Picker(rows("aa", "ab", "ba", "bb", "bc", "bd"), ALL);
    p.key({ name: "end" });
    expect(p.selected()!.id).toBe("bd");
    p.key({ ch: "a" }); // filter "a" -> aa, ab, ba
    expect(p.visible().map((r) => r.id)).toEqual(["aa", "ab", "ba"]);
    expect(p.selectedIndex()).toBe(2);
    expect(p.selected()!.id).toBe("ba");
    expect(p.key({ name: "return" })).toEqual({ kind: "choose", id: "ba" });
  });

  test("typing filters; backspace widens again", () => {
    const p = new Picker(rows("alpha", "beta", "gamma"), ALL);
    p.key({ ch: "a" });
    p.key({ ch: "m" });
    expect(p.filter()).toBe("am");
    expect(p.visible().map((r) => r.id)).toEqual(["gamma"]);
    p.key({ name: "backspace" });
    expect(p.filter()).toBe("a");
    expect(p.visible().map((r) => r.id)).toEqual(["alpha", "beta", "gamma"]);
    p.key({ name: "backspace" });
    expect(p.filter()).toBe("");
    // backspace on an empty filter is a no-op, not a cancel
    expect(p.key({ name: "backspace" })).toBeNull();
    expect(p.filter()).toBe("");
  });
});

describe("picker verbs", () => {
  test("enter chooses, f forks, n is new, escape and ctrl+c cancel", () => {
    const p = new Picker(rows("a", "b"), ALL);
    expect(p.key({ name: "return" })).toEqual({ kind: "choose", id: "a" });
    expect(p.key({ ch: "f" })).toEqual({ kind: "fork", id: "a" });
    expect(p.key({ ch: "n" })).toEqual({ kind: "new" });
    expect(p.key({ name: "escape" })).toEqual({ kind: "cancel" });
    expect(p.key({ name: "c", ctrl: true })).toEqual({ kind: "cancel" });
    expect(p.key({ name: "d", ctrl: true })).toEqual({ kind: "cancel" });
  });

  test("verbs the caller did not allow are filter characters instead", () => {
    const p = new Picker(rows("fnx"), { title: "t" });
    expect(p.key({ ch: "f" })).toBeNull();
    expect(p.key({ ch: "n" })).toBeNull();
    expect(p.key({ ch: "x" })).toBeNull();
    expect(p.filter()).toBe("fnx");
    expect(p.footer()).not.toContain("fork");
    expect(p.footer()).not.toContain("delete");
  });

  test("delete arms a confirm, y fires it, anything else keeps the list", () => {
    const p = new Picker(rows("a", "b"), ALL);
    expect(p.key({ ch: "x" })).toBeNull();
    expect(p.pendingConfirm()).toEqual({ action: "delete", id: "a", label: "a" });
    expect(p.footer()).toMatch(/cannot be undone/);
    expect(p.key({ ch: "y" })).toEqual({ kind: "delete", id: "a" });
    expect(p.pendingConfirm()).toBeNull();

    // a stray key disarms without closing the picker or moving the selection
    p.key({ ch: "D" });
    expect(p.pendingConfirm()).toBeTruthy();
    expect(p.key({ name: "down" })).toBeNull();
    expect(p.pendingConfirm()).toBeNull();
    expect(p.selected()!.id).toBe("a");
    expect(p.filter()).toBe(""); // the disarming key was not typed into the filter
  });

  test("an armed delete stays bound to the row it armed, not to the cursor", () => {
    // arming by index would let a filter edit slide a different session under
    // the cursor and `y` would destroy that one instead
    const p = new Picker(rows("keepme", "victim"), ALL);
    p.key({ name: "down" });
    p.key({ ch: "x" });
    expect(p.pendingConfirm()!.id).toBe("victim");
    // a filter keystroke would land on `keepme` if this were index-based...
    expect(p.key({ ch: "y" })).toEqual({ kind: "delete", id: "victim" });
  });

  test("the current session cannot be armed for deletion", () => {
    const p = new Picker([{ id: "live", cells: ["live"], search: "live", current: true }], ALL);
    expect(p.key({ ch: "x" })).toBeNull();
    expect(p.pendingConfirm()).toBeNull();
  });

  test("the confirm names the row, never its position in the list", () => {
    // the prompt used to take cells[0], which for a session list is the padded
    // list index — so an irreversible action asked "delete  2?", a number that
    // identifies nothing and that any filter keystroke renumbers
    const p = new Picker(
      [
        { id: "s-one", cells: [" 1", "s-one"], search: "s-one" },
        { id: "s-two", cells: [" 2", "s-two"], search: "s-two", label: 's-two "fix the login bug"' },
      ],
      ALL,
    );
    p.key({ name: "down" });
    p.key({ ch: "x" });
    expect(p.footer()).toContain('s-two "fix the login bug"');
    expect(p.footer()).not.toMatch(/delete\s+2\?/);

    // and with no label supplied it falls back to the id, still not the index
    p.key({ name: "escape" });
    p.key({ name: "up" });
    p.key({ ch: "x" });
    expect(p.pendingConfirm()!.label).toBe("s-one");
  });
});

describe("picker rows and window", () => {
  test("setRows keeps the place, and lands on the row that slid up after a delete", () => {
    const p = new Picker(rows("a", "b", "c"), ALL);
    p.key({ name: "down" }); // on "b"
    p.setRows(rows("a", "c")); // "b" deleted
    expect(p.selected()!.id).toBe("c"); // what moved into the slot
    expect(p.pendingConfirm()).toBeNull();

    // deleting the last row must not leave the selection off the end
    p.setRows(rows("a"));
    expect(p.selectedIndex()).toBe(0);
    p.setRows([]);
    expect(p.selectedIndex()).toBe(-1);
  });

  test("setRows follows a surviving selection when rows reorder", () => {
    const p = new Picker(rows("a", "b", "c"), ALL);
    p.key({ name: "down" });
    p.setRows(rows("c", "b", "a")); // recency shuffled under us
    expect(p.selected()!.id).toBe("b");
  });

  test("window keeps the selection visible and never over-runs the list", () => {
    const p = new Picker(rows(...Array.from({ length: 20 }, (_, i) => `r${i}`)), ALL);
    let w = p.window(5);
    expect(w.rows).toHaveLength(5);
    expect(w.offset).toBe(0);
    expect(w.selRow).toBe(0);

    p.key({ name: "end" }); // r19
    w = p.window(5);
    expect(w.rows.at(-1)!.id).toBe("r19");
    expect(w.offset).toBe(15);
    expect(w.rows[w.selRow].id).toBe("r19");

    // fewer rows than the window: no scroll, no padding
    const short = new Picker(rows("a", "b"), ALL);
    expect(short.window(10)).toMatchObject({ offset: 0, selRow: 0 });
    expect(short.window(10).rows).toHaveLength(2);
    // a degenerate height must still produce a paintable row
    expect(short.window(0).rows).toHaveLength(1);
  });
});
