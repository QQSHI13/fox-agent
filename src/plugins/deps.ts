/**
 * Plugin dependency ordering.
 *
 * A plugin declares `fox.dependencies` (other plugin NAMES) in its
 * `package.json`. That declaration is bookkeeping for the manager, NOT an
 * access API: a plugin reaches another with a plain ESM import. Declaring it
 * buys three things we cannot otherwise have:
 *
 *   1. activation ORDER — dependencies are registered before their dependents,
 *      so a plugin that wraps another's tool sees it already in the registry;
 *   2. DIAGNOSIS — a missing or disabled dependency is a clear warning naming
 *      the dependency, not a mystery failure deep inside an import;
 *   3. RESOLUTION — once there is a catalog, installing a plugin can fetch the
 *      closure of plugins it needs.
 *
 * ## Why plugins are skipped, not loaded broken
 *
 * `load.ts` holds the precedent that a broken plugin never blocks startup. The
 * tempting alternative is to load a plugin whose dependency is gone and let it
 * fail at use-time, so its unrelated features still work. We do not: a plugin
 * whose backend is missing can do more damage half-working than not at all
 * (a `pg-admin` with no database can still install hooks and intercept every
 * tool call). Skipping is the honest outcome and it is reported.
 *
 * ## Cycles
 *
 * A cycle is reported and the cycle members are kept in the order they were
 * discovered. Refusing to start is not an option (same precedent), and some
 * order has to win — a stable, discovered one beats a hang or a crash.
 */

/** The minimum a graph node needs: a name and what it depends on. */
export interface DepNode {
  name: string;
  dependencies: string[];
  /** set by the caller: a node the user turned off, or that failed to load */
  unavailable?: Set<string>;
}

export interface DepOrder {
  /** dependency-first order of available nodes; cycles keep discovered order */
  order: string[];
  /** a node skipped because a dependency is missing or disabled, and why */
  skipped: { name: string; missing: string; reason: string }[];
  /** every cycle found, as name lists in discovery order */
  cycles: string[][];
  /** a dependency naming a plugin that is not in the graph at all */
  unknownDeps: { name: string; dependency: string }[];
}

/**
 * Order `nodes` so a plugin follows everything it depends on.
 *
 * Kahn's algorithm over the "depends on" edges, with cycle detection: whatever
 * remains when no node can be emitted is a cycle (or depends only on one), and
 * is appended in discovery order rather than dropped.
 */
export function orderPlugins(nodes: DepNode[]): DepOrder {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const present = new Set(byName.keys());
  const off = new Map(nodes.map((n) => [n.name, n.unavailable ?? new Set<string>()]));
  const order: string[] = [];
  const skipped: DepOrder["skipped"] = [];
  const unknownDeps: DepOrder["unknownDeps"] = [];

  // WHY a dependency is unusable, which is the difference between "turn it on"
  // and "install it" — the whole point of reporting rather than just skipping.
  const reason = (dep: string): string =>
    present.has(dep) ? `'${dep}' is disabled` : `no plugin named '${dep}' is installed`;


  // An edge A -> B means "A needs B". Resolve to the available dep list:
  //   - a dep naming a node that does not exist at all -> unknown
  //   - a dep that exists but is unavailable            -> skipped
  //   - a dep naming nothing (a plugin with no deps)     -> no edges
  const resolved = new Map<string, { deps: string[]; missing: string | null; unknown: string[] }>();
  for (const n of nodes) {
    const deps: string[] = [];
    const unknown: string[] = [];
    let missing: string | null = null;
    for (const d of n.dependencies) {
      if (d === n.name) continue; // self-dependency: ignore, it is not an edge
      if (!present.has(d)) {
        // Nothing provides it at all. This is still a reason NOT to activate:
        // the chosen policy is "skip the dependent" for a missing dep as well as
        // a disabled one, and a typo'd or uninstalled dep is exactly the case
        // where a half-working plugin is worst — it looks installed and silently
        // does less than it claims. It is ALSO reported as unknownDeps, which is
        // the more actionable half ("install it") than the bare skip.
        unknown.push(d);
        if (!missing) missing = d;
        continue;
      }
      if (off.get(n.name)?.has(d)) {
        // record the FIRST unusable dependency for the warning; keep looking
        if (!missing) missing = d;
        continue;
      }
      deps.push(d);
    }
    resolved.set(n.name, { deps, missing, unknown });
    for (const u of unknown) unknownDeps.push({ name: n.name, dependency: u });
  }

  // a node whose dep is missing is skipped — it does not activate, so it
  // cannot satisfy anyone who depends on it either. Cascade: if B is skipped
  // because C is gone, A (which needs B) is skipped too.
  const dead = new Set<string>();
  for (const n of nodes) if (resolved.get(n.name)!.missing) dead.add(n.name);
  // iterate to a fixpoint so a cascade settles in one pass over the list
  for (let changed = true; changed; ) {
    changed = false;
    for (const n of nodes) {
      if (dead.has(n.name)) continue;
      const hit = resolved.get(n.name)!.deps.find((d) => dead.has(d));
      if (hit) {
        dead.add(n.name);
        resolved.get(n.name)!.missing = hit;
        changed = true;
      }
    }
  }
  for (const n of nodes) {
    if (dead.has(n.name)) skipped.push({ name: n.name, missing: resolved.get(n.name)!.missing!, reason: reason(resolved.get(n.name)!.missing!) });
  }

  // Kahn over the live set. dependents[d] = nodes waiting on d.
  const live = nodes.filter((n) => !dead.has(n.name));
  const dependents = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of live) {
    const deps = resolved.get(n.name)!.deps.filter((d) => !dead.has(d) && d !== n.name);
    indegree.set(n.name, deps.length);
    for (const d of deps) {
      if (!dependents.has(d)) dependents.set(d, []);
      dependents.get(d)!.push(n.name);
    }
  }
  const ready = live.filter((n) => indegree.get(n.name) === 0).map((n) => n.name);
  while (ready.length) {
    const n = ready.shift()!;
    order.push(n);
    for (const dependent of dependents.get(n) ?? []) {
      const left = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, left);
      if (left === 0) ready.push(dependent);
    }
  }

  // whatever is left is a cycle; report it and append in discovery order
  const cycles: string[][] = [];
  if (order.length < live.length) {
    const placed = new Set(order);
    const remaining = live.filter((n) => !placed.has(n.name)).map((n) => n.name);
    for (const start of remaining) {
      if (placed.has(start)) continue;
      // walk the remaining subgraph from `start` to recover the cycle members
      const seen: string[] = [];
      const walk = (cur: string) => {
        if (placed.has(cur) || seen.includes(cur)) return;
        seen.push(cur);
        for (const d of resolved.get(cur)?.deps ?? []) if (remaining.includes(d)) walk(d);
      };
      walk(start);
      for (const s of seen) {
        placed.add(s);
        order.push(s);
      }
      if (seen.length) cycles.push(seen);
    }
  }

  return { order, skipped, cycles, unknownDeps };
}
