/**
 * Build-time stub for `@ai-sdk/gateway`.
 *
 * fox-agent always passes an explicit provider model instance
 * (`createOpenAI(...).languageModel(id)` etc), so the `ai` barrel's *global
 * default provider* path is the only thing that reaches this package — and fox
 * never takes it. Stubbing the module at build time keeps its ~120KB (plus
 * `@vercel/oidc`) out of the binary while the real package stays installed and
 * typechecked.
 *
 * Reaching one of these functions means the assumption above broke, so it
 * throws a message that names the fix rather than the SDK's "no API key" path.
 */
const refuse = (): never => {
  throw new Error(
    "@ai-sdk/gateway is not bundled in fox-agent — construct a provider model explicitly (src/providers/*.ts)",
  );
};

/** Shape-compatible with the real `gateway` provider object. */
export const gateway = new Proxy({}, { get: () => refuse }) as Record<string, unknown>;
export const createGateway = refuse;
export default gateway;

// `ai` imports these two by name for its error-wrapping path.
export class GatewayError extends Error {}
export class GatewayAuthenticationError extends GatewayError {}
