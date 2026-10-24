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

// `ai` imports these two by name for its error paths, and calls the STATIC
// `isInstance` on them — not just their constructors:
//
//   wrapGatewayError()          -> GatewayAuthenticationError.isInstance(error)
//   retryWithExponentialBackoff -> GatewayError.isInstance(error) (inside shouldRetry)
//
// Exporting bare `class X extends Error {}` therefore left both statics
// undefined, and either call site threw `TypeError: isInstance is not a
// function` in place of the real provider error. It stayed hidden because the
// retry check short-circuits on APICallError first, which is what a normal
// provider failure is; only a non-API error reaching shouldRetry, or any error
// at all reaching wrapGatewayError, took the broken branch.
//
// `false` is the correct answer, not a placeholder: a GatewayError cannot
// exist when the gateway is not in the bundle. The marker check the real class
// does (`symbol in error`) is unreachable by construction here.
export class GatewayError extends Error {
  static isInstance(_error: unknown): boolean {
    return false;
  }
}
export class GatewayAuthenticationError extends GatewayError {
  static isInstance(_error: unknown): boolean {
    return false;
  }
}
