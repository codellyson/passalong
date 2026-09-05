// The Workers runtime globals — `D1Database`, `Fetcher`, `ExecutionContext` and the rest.
//
// apps/api declares these through `types` in its own tsconfig, but Nuxt generates its tsconfigs,
// so the reference goes in a .d.ts instead. It lives in `shared/` because that is the one
// directory all three generated configs pick up: `tsconfig.server.json` includes
// `../shared/**/*.d.ts` but not the project root, so a root-level file is silently ignored — and
// the server config is exactly where the mounted Hono app is checked.
/// <reference types="@cloudflare/workers-types" />
