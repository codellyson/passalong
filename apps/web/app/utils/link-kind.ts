// The URL reader lives in shared/ because the server renders GitHub chips in a work's document
// too (work-html.ts). Re-exported here so the hub auto-imports it as before.
export { linkKind, workStage, GITHUB_MARK } from "../../shared/link-kind";
export type { LinkKind } from "../../shared/link-kind";
