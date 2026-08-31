import { describe, expect, test } from "bun:test";
import { pickRelease, platformAsset, versionCmp, type ReleaseInfo } from "../src/core/upgrade.ts";

const rel = (tag: string, prerelease = false): ReleaseInfo => ({
  tag,
  version: tag.replace(/^v/, ""),
  prerelease,
  publishedAt: "2026-01-01",
  assets: [],
});

describe("versionCmp", () => {
  test("orders plain versions numerically, not lexically", () => {
    expect(versionCmp("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(versionCmp("1.2.3", "1.2.3")).toBe(0);
    expect(versionCmp("0.2.0", "1.0.0")).toBeLessThan(0);
  });

  test("a prerelease ranks below its own release", () => {
    expect(versionCmp("0.3.0-beta.1", "0.3.0")).toBeLessThan(0);
    expect(versionCmp("0.3.0", "0.3.0-beta.1")).toBeGreaterThan(0);
    // but still above the previous stable
    expect(versionCmp("0.3.0-beta.1", "0.2.0")).toBeGreaterThan(0);
  });

  test("two prereleases compare numerically per identifier", () => {
    expect(versionCmp("0.3.0-beta.2", "0.3.0-beta.1")).toBeGreaterThan(0);
    expect(versionCmp("0.3.0-beta.1", "0.3.0-beta.1")).toBe(0);
    // string compare would invert this ("10" < "2" lexically)
    expect(versionCmp("0.3.0-beta.10", "0.3.0-beta.2")).toBeGreaterThan(0);
    // numeric identifiers rank below alphanumeric, shorter set first on a tie
    expect(versionCmp("0.3.0-1", "0.3.0-alpha")).toBeLessThan(0);
    expect(versionCmp("0.3.0-beta", "0.3.0-beta.1")).toBeLessThan(0);
  });

  test("a leading v is ignored", () => {
    expect(versionCmp("v1.0.0", "1.0.0")).toBe(0);
  });
});

describe("pickRelease", () => {
  const list = [rel("v0.3.0-beta.1", true), rel("v0.2.0"), rel("v0.1.0")];

  test("default picks the newest stable, skipping betas", () => {
    expect(pickRelease(list)?.tag).toBe("v0.2.0");
  });

  test("beta picks the newest release, beta or not", () => {
    expect(pickRelease(list, { beta: true })?.tag).toBe("v0.3.0-beta.1");
  });

  test("an explicit version finds it, with or without the v", () => {
    expect(pickRelease(list, { to: "0.1.0" })?.tag).toBe("v0.1.0");
    expect(pickRelease(list, { to: "v0.2.0" })?.tag).toBe("v0.2.0");
    expect(pickRelease(list, { to: "9.9.9" })).toBeUndefined();
  });

  test("no stable at all returns undefined rather than a beta", () => {
    expect(pickRelease([rel("v0.3.0-beta.1", true)])).toBeUndefined();
  });
});

describe("platformAsset", () => {
  test("matches the release workflow's naming", () => {
    const p = { linux: "linux", darwin: "darwin" }[process.platform as string];
    const expected = p ? `fox-${p}-${process.arch}` : null;
    expect(platformAsset()).toBe(expected);
  });
});
