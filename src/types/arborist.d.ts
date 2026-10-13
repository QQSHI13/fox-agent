/**
 * Minimal type surface for `@npmcli/arborist`.
 *
 * The package ships no `.d.ts` (it is plain CommonJS from npm's internals), so
 * importing it under `noImplicitAny` is an error. We declare only the two
 * members we use rather than pulling in `@types/*` or copying npm's internal
 * types: this is a pinned dependency whose surface we depend on narrowly, and
 * a wrong or drifting type is worse than an honest local declaration.
 */
declare module "@npmcli/arborist" {
  /** One package in the resolved tree. */
  export interface ArboristNode {
    name?: string;
    version?: string;
    location?: string;
  }

  export interface ReifyResult {
    /** every package in the tree after install */
    inventory?: { values(): Iterable<ArboristNode> };
  }

  export interface ArboristOptions {
    /** the directory whose package.json drives the install */
    path: string;
    /**
     * Do not run dependency lifecycle scripts (`preinstall`/`install`/
     * `postinstall`). A dependency must not execute code in the user's home
     * with the user's credentials unless the user asked for that dependency
     * specifically.
     */
    ignoreScripts?: boolean;
    /** npm audit report; we do not consume it, but Arborist waits on it */
    audit?: boolean;
    /** create `node_modules/.bin` shims */
    binLinks?: boolean;
    progress?: boolean;
  }

  export interface ReifyOptions {
    add?: string[];
    update?: boolean;
    save?: boolean;
    saveType?: string;
    audit?: boolean;
    preferOnline?: boolean;
    noGitRevCache?: boolean;
  }

  export class Arborist {
    constructor(opts: ArboristOptions);
    /** resolve and write the tree to disk; resolves with the new tree */
    reify(opts?: ReifyOptions): Promise<ReifyResult>;
  }
}
