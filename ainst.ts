// Does bun's auto-install actually fire for a plugin-shaped import? Three cases
// that decide whether this is usable for fox-agent:
//   1. a plugin dir with NO node_modules anywhere up the tree
//   2. same, but a PARENT has node_modules (our shared-store layout!)
//   3. a compiled binary (the plugin loader path)
// Throwaway — deleted after.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const ROOT = "/tmp/autoinst";

// case 1: clean — nothing above it either
mkdirSync(`${ROOT}/clean/plugin`, { recursive: true });
writeFileSync(`${ROOT}/clean/plugin/index.ts`, `import isOdd from "is-odd";\nexport default { name: "clean", odd3: isOdd(3) };\n`);

// case 2: a sibling package.json/node_modules EXISTS at the root, so a naive
// node resolver would walk up and find nothing — does auto-install still work?
mkdirSync(`${ROOT}/store/node_modules/someother`, { recursive: true });
writeFileSync(`${ROOT}/store/node_modules/someother/package.json`, JSON.stringify({ name: "someother", version: "1.0.0", main: "i.js" }));
writeFileSync(`${ROOT}/store/node_modules/someother/i.js`, "module.exports = 1;\n");
writeFileSync(`${ROOT}/store/package.json`, JSON.stringify({ name: "fox-plugin-store", private: true, version: "0.0.0" }));
mkdirSync(`${ROOT}/store/plugin`, { recursive: true });
writeFileSync(`${ROOT}/store/plugin/index.ts`, `import isOdd from "is-odd";\nexport default { name: "store", odd3: isOdd(3) };\n`);

writeFileSync(
  `${ROOT}/host.ts`,
  `const cases: [string, string][] = [["clean", "${ROOT}/clean/plugin/index.ts"], ["store(parent has node_modules)", "${ROOT}/store/plugin/index.ts"]];
for (const [label, p] of cases) {
  try {
    const m = await import("file://" + p);
    console.log(label.padEnd(30), "-> OK", JSON.stringify((m as { default: unknown }).default));
  } catch (e) {
    console.log(label.padEnd(30), "-> FAIL", (e as Error).message.split("\\n")[0].slice(0, 80));
  }
}
// did auto-install actually create anything on disk?
import { existsSync as ex } from "node:fs";
console.log("clean/plugin/node_modules exists:", ex("${ROOT}/clean/plugin/node_modules"));
console.log("store/node_modules/is-odd  exists:", ex("${ROOT}/store/node_modules/is-odd"));
`,
);
console.log("scaffolded");
