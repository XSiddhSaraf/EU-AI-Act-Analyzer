// Ambient global declaration for the Cloudflare Workers `Env` type used by
// the `env` export of the `cloudflare:workers` module (see db/index.ts).
// `@cloudflare/workers-types` types that export as `Cloudflare.Env`, an
// empty interface that consumers are expected to augment via declaration
// merging.
declare namespace Cloudflare {
  interface Env {
    /** D1 binding used for usage metering (see db/index.ts, db/schema.ts). */
    DB: D1Database;
  }
}
