// One shared folder, for the page at /f/:id/:key. See server/utils/shared-folder.ts for what the
// key opens. Documents render through the same sanitising pipeline the hub uses: a shared page
// runs no script, but a folder document is still somebody's text shown to somebody else.
import { renderFolderMarkdown } from "../../../../app/utils/folder-markdown";
import { db } from "../../../utils/d1";
import { sharedFolder } from "../../../utils/shared-folder";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const inside = typeof query.in === "string" ? query.in : "";
  const { root, tree, current } = await sharedFolder(
    event,
    getRouterParam(event, "id") || "",
    getRouterParam(event, "key") || "",
    inside,
  );
  const [{ results: documents }, { results: files }] = await Promise.all([
    db(event)
      .prepare(
        "SELECT id, name, updated FROM folder_document WHERE folder_id = ? ORDER BY name COLLATE NOCASE",
      )
      .bind(current.id)
      .all<{ id: string; name: string; updated: string }>(),
    db(event)
      .prepare(
        "SELECT id, name, type, bytes FROM folder_asset WHERE folder_id = ? ORDER BY name COLLATE NOCASE",
      )
      .bind(current.id)
      .all<{ id: string; name: string; type: string; bytes: number }>(),
  ]);
  const wanted = typeof query.doc === "string" ? query.doc : "";
  const pick = documents.find((d) => d.id === wanted) ?? documents[0];
  const open = pick
    ? await db(event)
        .prepare("SELECT body FROM folder_document WHERE id = ? AND folder_id = ?")
        .bind(pick.id, current.id)
        .first<{ body: string }>()
    : null;
  // Breadcrumbs stop at the shared root: nothing above it is the reader's business.
  const byId = new Map(tree.map((f) => [f.id, f]));
  const crumbs = [];
  for (let at: typeof current | undefined = current; at; at = byId.get(at.parent_id)) {
    crumbs.unshift({ id: at.id, title: at.title });
    if (at.id === root.id) break;
  }
  return {
    root: { id: root.id, title: root.title },
    folder: { id: current.id, title: current.title, description: current.description },
    crumbs,
    children: tree
      .filter((f) => f.parent_id === current.id && f.id !== current.id)
      .map((f) => ({ id: f.id, title: f.title }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    documents,
    document: pick ? { ...pick, html: renderFolderMarkdown(open?.body || "") } : null,
    files,
  };
});
