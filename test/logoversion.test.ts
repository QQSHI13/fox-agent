/**
 * The mark's colour is a pure function of the version string.
 *
 * The three scales are a design contract, so they are pinned here rather than
 * left to the eye: a patch must NOT change the family or the direction (it is a
 * nudge, not a new mark), a minor must change the direction, and a major must
 * change the family. If any of those silently stop holding, the logo stops
 * meaning anything about the version — which is the entire point of the scheme.
 */
import { describe, expect, test } from "bun:test";
import {
  DIRECTIONS,
  FAMILIES,
  cellColor,
  designColors,
  designForVersion,
  hslToHex,
  parseSemver,
} from "../src/tui/logoversion.ts";

describe("version -> design", () => {
  test("a patch bump nudges the colour without changing family or direction", () => {
    const a = designForVersion("0.7.0");
    const b = designForVersion("0.7.1");
    expect(b.family.name).toBe(a.family.name);
    expect(b.direction.name).toBe(a.direction.name);
    // visible side by side, identical in isolation: that is the design intent
    expect(designColors(b).from).not.toBe(designColors(a).from);
  });

  test("a minor bump turns the gradient, keeping the family", () => {
    const a = designForVersion("0.7.0");
    const c = designForVersion("0.8.0");
    expect(c.family.name).toBe(a.family.name);
    expect(c.direction.name).not.toBe(a.direction.name);
  });

  test("a major bump changes the hue family", () => {
    const a = designForVersion("0.7.0");
    const d = designForVersion("1.0.0");
    expect(d.family.name).not.toBe(a.family.name);
    expect(designColors(d).from).not.toBe(designColors(a).from);
  });

  test("the same version always produces the same design", () => {
    // A Date.now() or Math.random() anywhere in the designer would make the mark
    // flicker between processes and between two runs in one session.
    const once = designForVersion("0.7.0");
    const twice = designForVersion("0.7.0");
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  test("families and directions wrap instead of failing at high versions", () => {
    // 6 families, 4 directions: both must cycle rather than throw or return
    // undefined, so a version can never be unrenderable.
    expect(designForVersion("6.0.0").family.name).toBe(FAMILIES[0].name);
    expect(designForVersion("0.4.0").direction.name).toBe(DIRECTIONS[0].name);
    expect(designForVersion("99.99.99").family).toBeDefined();
  });

  test("prerelease and build tails are ignored, not misparsed", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, tail: "" });
    expect(parseSemver("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, tail: "" });
    expect(parseSemver("1.2.3-beta.1")).toEqual({ major: 1, minor: 2, patch: 3, tail: "beta.1" });
    // junk must not produce NaN, which would poison every hue downstream
    expect(parseSemver("x.y.z")).toEqual({ major: 0, minor: 0, patch: 0, tail: "" });
  });
});

describe("colour helpers", () => {
  test("hslToHex matches known values", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
    expect(hslToHex(120, 100, 50)).toBe("#00ff00");
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
    expect(hslToHex(0, 0, 0)).toBe("#000000");
  });

  test("every cell of a design is a valid hex colour", () => {
    // A NaN hue from a bad parse would surface here as '#NaNNaN', not as a crash.
    const d = designForVersion("0.7.0");
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 20; x++) {
        expect(cellColor(d, x, y, 20, 8)).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  test("the gradient actually spans the mark", () => {
    // First and last cell must differ, or "gradient" is a lie and the mark is a
    // flat colour that would make two versions indistinguishable.
    const d = designForVersion("0.7.0");
    expect(cellColor(d, 0, 0, 20, 8)).not.toBe(cellColor(d, 19, 8, 20, 8));
  });
});
