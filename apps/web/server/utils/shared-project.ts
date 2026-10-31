// A shared project, by its id and its share key: the project the link names, and any project inside it.
//
// As with a piece of work, the id is an address and the **key is the secret**: holding it is the whole
// authorisation check. It opens exactly the subtree under the project it was made for — never a
// parent, never a sibling — and never the work linked in it, which have links of their own.
import type { H3Event } from "h3";
import { db } from "./d1";

const ID_RE = /^[a-z0-9]{6,16}$/;
const KEY_RE = /^[a-z0-9]{16,32}$/;

export interface SharedProject {
  id: string;
  title: string;
  description: string;
  parent_id: string;
}

/**
 * The shared root and, when `inside` names one, a project within it. Anything else — a malformed
 * address, a wrong key, a project outside the subtree — is the same 404, because whether a project
 * exists is exactly what the key is meant to withhold.
 */
export async function sharedProject(event: H3Event, id: string, key: string, inside = "") {
  const missing = () => createError({ statusCode: 404, statusMessage: "no such project" });
  if (!ID_RE.test(id) || !KEY_RE.test(key) || (inside && !ID_RE.test(inside))) throw missing();
  const root = await db(event)
    .prepare("SELECT id, title, description, parent_id FROM project WHERE id = ? AND share_key = ?")
    .bind(id, key)
    .first<SharedProject>();
  if (!root) throw missing();
  // The root and everything beneath it, which is what the link may show.
  const { results: tree } = await db(event)
    .prepare(
      `WITH RECURSIVE sub(id, title, description, parent_id) AS (
         SELECT id, title, description, parent_id FROM project WHERE id = ?
         UNION ALL
         SELECT f.id, f.title, f.description, f.parent_id FROM project f JOIN sub ON f.parent_id = sub.id
       ) SELECT * FROM sub LIMIT 500`,
    )
    .bind(root.id)
    .all<SharedProject>();
  const current = inside ? tree.find((f) => f.id === inside) : root;
  if (!current) throw missing();
  return { root, tree, current };
}
