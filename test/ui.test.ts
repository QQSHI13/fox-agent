import { describe, expect, test } from "bun:test";
import { CUSTOM_OPTION, isCustomOption, visibleOptions } from "../src/core/ui.ts";

const OPTIONS = [
  { value: "low", label: "low" },
  { value: "medium", label: "medium effort" },
  { value: "high", label: "high" },
];

describe("visibleOptions", () => {
  test("narrows on label or value, case-insensitively, and a blank filter keeps everything", () => {
    expect(visibleOptions(OPTIONS, "", false)).toEqual(OPTIONS);
    expect(visibleOptions(OPTIONS, "  ", false)).toEqual(OPTIONS);
    expect(visibleOptions(OPTIONS, "EFFORT", false)).toEqual([OPTIONS[1]]);
    expect(visibleOptions(OPTIONS, "hig", false)).toEqual([OPTIONS[2]]);
  });

  test("no custom row unless the step asked for one", () => {
    const shown = visibleOptions(OPTIONS, "", false);
    expect(shown).toEqual(OPTIONS);
    expect(shown.some((o) => isCustomOption(o))).toBe(false);
  });

  test("a custom step appends the row last, after the listed options", () => {
    const shown = visibleOptions(OPTIONS, "", true);
    expect(shown.slice(0, -1)).toEqual(OPTIONS);
    expect(isCustomOption(shown.at(-1))).toBe(true);
    expect(shown.at(-1)!.label).toBe("other…");
  });

  test("the custom row is the path out when the filter matches nothing", () => {
    // the one case filtering it away would break: with every option gone there
    // would be no way to reach a value the list never had
    const shown = visibleOptions(OPTIONS, "zzz", true);
    expect(shown).toEqual([CUSTOM_OPTION]);
    expect(isCustomOption(shown[0])).toBe(true);
  });

  test("the filter does not eat the custom row even when it could match", () => {
    // it is an affordance, not a searchable entry — typing "other" should not
    // collapse the list onto the sentinel
    const shown = visibleOptions(OPTIONS, "othe", true);
    expect(shown).toEqual([CUSTOM_OPTION]);
    expect(visibleOptions(OPTIONS, "", true)).toHaveLength(OPTIONS.length + 1);
  });

  test("a custom row is never mistaken for a real option", () => {
    expect(isCustomOption(CUSTOM_OPTION)).toBe(true);
    expect(isCustomOption(OPTIONS[0])).toBe(false);
    expect(isCustomOption(undefined)).toBe(false);
    // a command must never receive the sentinel as an answer
    expect(CUSTOM_OPTION.value).not.toBe("low");
  });
});
