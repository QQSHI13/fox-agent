/**
 * Build-time stub for the MCP SDK's Ajv-backed JSON Schema validator.
 *
 * fox only runs the *client* side of MCP (`src/tools/mcp.ts`). There, ajv is
 * reached for exactly one thing: pre-compiling a validator for a tool whose
 * server declared an `outputSchema` (see `cacheToolMetadata` in the SDK's
 * client). fox never consumes those validators, so the whole ajv cluster
 * (ajv + ajv-formats + fast-uri + json-schema-traverse, ~274KB) is dead weight.
 *
 * The stub accepts every input. That is the honest behavior for "no validation
 * was being performed on this value anyway": nothing fox read was derived from
 * the validator's answer.
 */
export class AjvJsonSchemaValidator {
  constructor(_ajv?: unknown) {}

  /** Returns a validator that accepts everything. */
  getValidator(_schema: unknown): (input: unknown) => boolean {
    return () => true;
  }
}
