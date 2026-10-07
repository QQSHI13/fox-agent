// Text-imported assets: docs/agent/*.md ride inside the compiled binary via
// `import ... with { type: "text" }` (src/core/selfdocs.ts). Bun supports the
// attribute; tsc needs the module shape declared.
declare module "*.md" {
  const content: string;
  export default content;
}
