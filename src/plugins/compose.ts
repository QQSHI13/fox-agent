import { PLUGIN_CONTRIBUTION_KEYS, type PluginManifest } from "./manifest.ts";

export interface ManifestNode {
  manifest: PluginManifest;
  /** the configured path this manifest came from, used in diagnostics */
  source: string;
  /** bundled plugins sort before external plugins unless a dependency says otherwise */
  bundled: boolean;
}

export interface ComposeResult {
  /** empty when any error exists: composition fails closed */
  order: ManifestNode[];
  warnings: string[];
  errors: string[];
  /** `${kind}:${id}` to the plugin id that owns it */
  contributions: ReadonlyMap<string, string>;
}

function contributionPairs(manifest: PluginManifest): string[] {
  const out: string[] = [];
  for (const kind of PLUGIN_CONTRIBUTION_KEYS) {
    // Hook names are shared lifecycle points (`beforeLLMCall`, `afterTool`),
    // not resources one plugin owns. Two plugins implementing the same hook is
    // the normal case and must compose.
    if (kind === "hooks") continue;
    for (const id of manifest.contributes[kind] ?? []) out.push(`${kind}:${id}`);
  }
  return out;
}

/**
 * Deterministically order plugin manifests and reject compositions that cannot
 * be loaded safely. Any error returns an empty order so the caller can fail
 * closed without guessing which half of a bad graph was safe.
 */
export function composePluginManifests(nodes: ManifestNode[]): ComposeResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const byId = new Map<string, ManifestNode>();
  const contributionOwner = new Map<string, string>();

  for (const node of nodes) {
    const id = node.manifest.id;
    if (byId.has(id)) {
      errors.push(`duplicate plugin id '${id}' (${byId.get(id)!.source} and ${node.source})`);
      continue;
    }
    byId.set(id, node);
    for (const contribution of contributionPairs(node.manifest)) {
      const owner = contributionOwner.get(contribution);
      if (owner === id) {
        errors.push(`duplicate contribution '${contribution}' declared twice by plugin '${id}'`);
      } else if (owner) {
        errors.push(`duplicate contribution '${contribution}' from '${owner}' and '${id}'`);
      } else {
        contributionOwner.set(contribution, id);
      }
    }
  }

  const incoming = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of byId.values()) {
    incoming.set(node.manifest.id, 0);
  }
  for (const node of byId.values()) {
    for (const dependency of node.manifest.dependencies ?? []) {
      if (dependency === node.manifest.id) {
        errors.push(`plugin '${node.manifest.id}' cannot depend on itself`);
        continue;
      }
      if (!byId.has(dependency)) {
        errors.push(`plugin '${node.manifest.id}' has unknown dependency '${dependency}'`);
        continue;
      }
      incoming.set(node.manifest.id, incoming.get(node.manifest.id)! + 1);
      const list = dependents.get(dependency) ?? [];
      list.push(node.manifest.id);
      dependents.set(dependency, list);
    }
  }

  const stable = [...nodes].sort((a, b) => Number(b.bundled) - Number(a.bundled));
  const ready = stable.filter((node) => byId.has(node.manifest.id) && incoming.get(node.manifest.id) === 0);
  const order: ManifestNode[] = [];
  const placed = new Set<string>();

  while (ready.length) {
    const node = ready.shift()!;
    const id = node.manifest.id;
    if (placed.has(id)) continue;
    placed.add(id);
    order.push(node);
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = incoming.get(dependent)! - 1;
      incoming.set(dependent, remaining);
      if (remaining === 0) {
        const dependentNode = byId.get(dependent)!;
        if (!placed.has(dependent)) ready.push(dependentNode);
      }
    }
  }

  if (placed.size !== byId.size) {
    const unresolved = [...byId.keys()].filter((id) => !placed.has(id));
    errors.push(`dependency cycle among plugins: ${unresolved.join(", ")}`);
  }

  return { order: errors.length ? [] : order, warnings, errors, contributions: contributionOwner };
}
