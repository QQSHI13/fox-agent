import { describe, expect, test } from "bun:test";
import { orderPlugins, type DepNode } from "../src/plugins/deps.ts";

const nodes = (...specs: [string, string[]][]): DepNode[] => specs.map(([name, dependencies]) => ({ name, dependencies }));

describe("orderPlugins: dependencies activate first", () => {
  test("an independent plugin keeps its own order", () => {
    const r = orderPlugins(nodes(["a", []], ["b", []]));
    expect(r.order).toEqual(["a", "b"]);
    expect(r.skipped).toEqual([]);
    expect(r.cycles).toEqual([]);
  });

  test("a dependent comes after its dependency", () => {
    const r = orderPlugins(nodes(["app", ["db"]], ["db", []]));
    expect(r.order).toEqual(["db", "app"]);
  });

  test("ordering is independent of declaration order", () => {
    // declared dependent-first, must still emit dependency-first
    const a = orderPlugins(nodes(["app", ["db"]], ["db", []])).order;
    const b = orderPlugins(nodes(["db", []], ["app", ["db"]])).order;
    expect(a).toEqual(b);
    expect(a.indexOf("db")).toBeLessThan(a.indexOf("app"));
  });

  test("a chain resolves fully, in dependency order", () => {
    const r = orderPlugins(nodes(["c", ["b"]], ["b", ["a"]], ["a", []]));
    expect(r.order).toEqual(["a", "b", "c"]);
  });

  test("a diamond: both prerequisites precede the join", () => {
    const r = orderPlugins(nodes(["join", ["left", "right"]], ["left", ["base"]], ["right", ["base"]], ["base", []]));
    const at = (n: string) => r.order.indexOf(n);
    expect(at("base")).toBeLessThan(at("left"));
    expect(at("base")).toBeLessThan(at("right"));
    expect(at("left")).toBeLessThan(at("join"));
    expect(at("right")).toBeLessThan(at("join"));
  });

  test("a self-dependency is not an edge", () => {
    const r = orderPlugins(nodes(["a", ["a"]]));
    expect(r.order).toEqual(["a"]);
    expect(r.cycles).toEqual([]);
    expect(r.skipped).toEqual([]);
  });
});

describe("orderPlugins: a missing dependency skips the dependent", () => {
  test("a dep naming no such plugin is reported AND skips the dependent", () => {
    const r = orderPlugins(nodes(["app", ["ghost"]]));
    // The chosen policy is "skip the dependent" for a missing dep too, not just
    // a disabled one: a plugin whose backend was never installed looks present
    // and silently does less than it claims. It is ALSO reported as unknownDeps,
    // which is the actionable half ("install it").
    expect(r.skipped).toEqual([
      { name: "app", missing: "ghost", reason: "no plugin named 'ghost' is installed" },
    ]);
    expect(r.unknownDeps).toEqual([{ name: "app", dependency: "ghost" }]);
    expect(r.order).toEqual([]);
  });


  test("a DISABLED dependency skips the dependent", () => {
    // sanity: the healthy graph keeps both, dependency first
    expect(orderPlugins(nodes(["app", ["db"]], ["db", []])).order).toEqual(["db", "app"]);

    // db turned off: app has nothing to attach to, so it does not activate
    const withOff = nodes(["app", ["db"]], ["db", []]);
    withOff[0].unavailable = new Set(["db"]);
    const r = orderPlugins(withOff);
    expect(r.skipped).toEqual([{ name: "app", missing: "db", reason: "'db' is disabled" }]);
    expect(r.order).toEqual(["db"]); // db itself still activates
  });


  test("a skip CASCADES: a -> b -> (c is gone) skips b, then a", () => {
    const n = nodes(["a", ["b"]], ["b", ["c"]], ["c", []]);
    n[1].unavailable = new Set(["c"]); // c is off
    const r = orderPlugins(n);
    expect(r.skipped.map((s) => `${s.name}<-${s.missing}`).sort()).toEqual(["a<-b", "b<-c"]);
    expect(r.order).toEqual(["c"]); // only c activates
  });


  test("the warning names the FIRST unusable dependency", () => {
    const n = nodes(["app", ["gone1", "gone2"]]);
    n[0].unavailable = new Set(["gone1", "gone2"]);
    const r = orderPlugins(n);
    expect(r.skipped).toEqual([
      { name: "app", missing: "gone1", reason: "no plugin named 'gone1' is installed" },
    ]);
  });

});

describe("orderPlugins: cycles never hang or drop a plugin", () => {
  test("a two-node cycle is reported and both still load", () => {
    const r = orderPlugins(nodes(["a", ["b"]], ["b", ["a"]]));
    expect(r.order.sort()).toEqual(["a", "b"]); // both present
    expect(r.cycles.length).toBe(1);
    expect(r.cycles[0].sort()).toEqual(["a", "b"]);
  });

  test("a three-node cycle loads all three", () => {
    const r = orderPlugins(nodes(["a", ["c"]], ["b", ["a"]], ["c", ["b"]]));
    expect(r.order.sort()).toEqual(["a", "b", "c"]);
    expect(r.cycles.length).toBe(1);
  });

  test("an unrelated plugin still loads first, ahead of a cycle", () => {
    const r = orderPlugins(nodes(["a", ["b"]], ["b", ["a"]], ["solo", []]));
    expect(r.order[0]).toBe("solo"); // no edges -> emitted in the first pass
    expect(r.order.sort()).toEqual(["a", "b", "solo"]);
  });

  test("a cycle breaks when one member is skipped, and the rest cascade", () => {
    // a <-> b is a cycle, and a ALSO needs "gone". a is out, which makes b
    // unusable in turn (b depends on a), so both go and no cycle remains —
    // a cascade must not be reported as a cycle.
    const n = nodes(["a", ["b", "gone"]], ["b", ["a"]], ["gone", []]);
    n[0].unavailable = new Set(["gone"]);
    const r = orderPlugins(n);
    expect(r.skipped.map((s) => `${s.name}<-${s.missing}`).sort()).toEqual(["a<-gone", "b<-a"]);
    expect(r.order).toEqual(["gone"]);
    expect(r.cycles).toEqual([]);
  });

});
