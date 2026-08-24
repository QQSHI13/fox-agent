// Single source of truth for the version string. package.json is the origin;
// everything that reports a version (system prompt, MCP client identity,
// fetch user-agent, `fox --version`) reads it from here.
import pkg from "../../package.json" with { type: "json" };

export const VERSION: string = (pkg as { version: string }).version;
