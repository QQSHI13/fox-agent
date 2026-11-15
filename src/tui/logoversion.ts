/**
 * The mark's colour, derived from the version.
 *
 * The idea: the logo IS the version you are running. Bump a version and the mark
 * moves with it, on three deliberately different scales:
 *
 *   patch  (0.7.0 -> 0.7.1)  a few degrees of hue. Side by side you can see it;
 *                            in isolation you cannot. The mark stays recognisably
 *                            "the current one".
 *   minor  (0.7.0 -> 0.8.0)  the gradient turns. Horizontal becomes diagonal,
 *                            diagonal becomes vertical. Unmistakable at a glance.
 *   major  (0.7.0 -> 1.0.0)  the whole hue family changes. Different mark.
 *
 * Everything is a pure function of the version string, so the same version always
 * produces the same mark on every machine — this is a reproducible design, not a
 * random pick. A `Date.now()` anywhere in here would make the logo flicker
 * between processes and twice in one session.
 */

export interface Ramp {
  fromHue: number;
  toHue: number;
  fromSat: number;
  toSat: number;
  fromLight: number;
  toLight: number;
}

export interface Family {
  name: string;
  ramp: Ramp;
}

/**
 * Hue families, one per major version.
 *
 * Chosen to be distinguishable from each other AND from the neighbours on a
 * terminal: a 25-degree gap reads as a different colour, a 10-degree gap reads as
 * a slightly-off version of the same one. Amber is deliberately NOT first — an
 * orange wordmark on a dark terminal reads as a certain other assistant's.
 */
export const FAMILIES: Family[] = [
  { name: "signal", ramp: { fromHue: 176, toHue: 205, fromSat: 62, toSat: 78, fromLight: 62, toLight: 42 } }, // teal -> azure
  { name: "ember", ramp: { fromHue: 44, toHue: 14, fromSat: 92, toSat: 88, fromLight: 64, toLight: 36 } }, // amber -> ember
  { name: "violet", ramp: { fromHue: 274, toHue: 306, fromSat: 62, toSat: 72, fromLight: 70, toLight: 44 } }, // violet -> magenta
  { name: "moss", ramp: { fromHue: 96, toHue: 146, fromSat: 52, toSat: 62, fromLight: 58, toLight: 34 } }, // lime -> forest
  { name: "rose", ramp: { fromHue: 344, toHue: 358, fromSat: 78, toSat: 70, fromLight: 68, toLight: 40 } }, // rose -> wine
  { name: "slate", ramp: { fromHue: 210, toHue: 232, fromSat: 18, toSat: 34, fromLight: 72, toLight: 40 } }, // grey -> steel
];

/**
 * Gradient direction, one per minor version.
 *
 * These are (x, y) weights, not angles, because that is what the per-cell sweep
 * already computes: `t = x/w * wx + y/h * wy`. Rotating the pair rotates the
 * gradient, and the four below are the four that look intentional — an arbitrary
 * angle just looks like the gradient is sliding off the word.
 */
export const DIRECTIONS: { name: string; wx: number; wy: number }[] = [
  { name: "horizontal", wx: 1, wy: 0 },
  { name: "diagonal", wx: 0.8, wy: 0.2 },
  { name: "forward", wx: 0.55, wy: 0.45 },
  { name: "vertical", wx: 0.1, wy: 0.9 },
];

/** Degrees of hue drift per patch version. Small on purpose — see the header. */
const PATCH_HUE_STEP = 3.5;
/** Lightness drift per patch, so a long patch series does not go monotone. */
const PATCH_LIGHT_STEP = 0.6;

export interface Semver {
  major: number;
  minor: number;
  patch: number;
  /** prerelease/build tail, ignored for the design */
  tail: string;
}

/** Parse `1.2.3`, `1.2.3-beta.1`, `v1.2.3`. Missing parts are 0. */
export function parseSemver(version: string): Semver {
  const core = version.trim().replace(/^v/i, "");
  const [head, ...rest] = core.split("-");
  const nums = head.split(".").map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return {
    major: nums[0] ?? 0,
    minor: nums[1] ?? 0,
    patch: nums[2] ?? 0,
    tail: rest.join("-"),
  };
}

export interface Design {
  version: string;
  major: number;
  minor: number;
  patch: number;
  family: Family;
  /** which of DIRECTIONS this version uses */
  direction: { name: string; wx: number; wy: number };
  /** fully resolved ramps after the patch drift */
  from: { h: number; s: number; l: number };
  to: { h: number; s: number; l: number };
}

/**
 * Resolve a version to a design.
 *
 * `major % FAMILIES.length` and `minor % DIRECTIONS.length` wrap deliberately:
 * a version should never be unable to render, and running out of families at 6
 * should cycle rather than throw.
 */
export function designForVersion(version: string, families: Family[] = FAMILIES): Design {
  const v = parseSemver(version);
  const family = families[Math.max(0, v.major) % families.length];
  const direction = DIRECTIONS[Math.max(0, v.minor) % DIRECTIONS.length];

  // The patch drift is signed off the patch number so it keeps moving in one
  // direction within a minor series, instead of oscillating around zero and
  // making two adjacent patches look identical.
  const drift = v.patch * PATCH_HUE_STEP;
  const lift = Math.min(8, v.patch * PATCH_LIGHT_STEP);

  const wrapHue = (h: number) => ((h % 360) + 360) % 360;
  return {
    version,
    major: v.major,
    minor: v.minor,
    patch: v.patch,
    family,
    direction,
    from: {
      h: wrapHue(family.ramp.fromHue + drift),
      s: family.ramp.fromSat,
      l: Math.min(92, family.ramp.fromLight + lift),
    },
    to: {
      h: wrapHue(family.ramp.toHue + drift),
      s: family.ramp.toSat,
      l: Math.min(88, family.ramp.toLight + lift),
    },
  };
}

// --- HSL <-> hex ------------------------------------------------------------
// Inlined rather than imported: this runs once per version, not per frame, and a
// dependency for 20 lines of arithmetic is not worth the import edge.

export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = ln - c / 2;
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

/** The two endpoint colours of a design, as hex. */
export function designColors(d: Design): { from: string; to: string } {
  return {
    from: hslToHex(d.from.h, d.from.s, d.from.l),
    to: hslToHex(d.to.h, d.to.s, d.to.l),
  };
}

/**
 * The colour of one cell, interpolated in HSL rather than RGB.
 *
 * RGB interpolation between two saturated hues passes through a muddy middle; HSL
 * keeps saturation up and the mid-gradient stays as vivid as the ends.
 */
export function cellColor(d: Design, x: number, y: number, w: number, h: number): string {
  const raw = (x / Math.max(1, w - 1)) * d.direction.wx + (y / Math.max(1, h - 1)) * d.direction.wy;
  const t = Math.min(1, Math.max(0, raw));
  // shortest way round the wheel, so a red->red ramp does not sweep through green
  let dh = d.to.h - d.from.h;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return hslToHex(
    d.from.h + dh * t,
    d.from.s + (d.to.s - d.from.s) * t,
    d.from.l + (d.to.l - d.from.l) * t,
  );
}
