// A file from a shared project, saved rather than shown: the same headers as the signed-in download
// in apps/api/src/projects.ts. The key opens only files in the shared project's subtree.

import { db } from "../../../../../utils/d1";
import { sharedProject } from "../../../../../utils/shared-project";

interface R2Object {
  body: ReadableStream;
}

export default defineEventHandler(async (event) => {
  const { tree } = await sharedProject(
    event,
    getRouterParam(event, "id") || "",
    getRouterParam(event, "key") || "",
  );
  const file = await db(event)
    .prepare("SELECT id, project_id, name, type FROM project_file WHERE id = ?")
    .bind(getRouterParam(event, "file") || "")
    .first<{ id: string; project_id: string; name: string; type: string }>();
  if (!file || !tree.some((f) => f.id === file.project_id))
    throw createError({ statusCode: 404, statusMessage: "no such file" });
  const shots = (
    event.context.cloudflare as { env?: { SHOTS?: { get(key: string): Promise<R2Object | null> } } }
  )?.env?.SHOTS;
  const object = await shots?.get(`projects/${file.project_id}/${file.id}`);
  if (!object) throw createError({ statusCode: 404, statusMessage: "no such file" });
  // A quoted filename with nothing that could close the quote or start a header.
  const filename = file.name.replace(/["\\\r\n]/g, "_") || "file";
  return new Response(object.body, {
    headers: {
      "content-type": file.type,
      "content-disposition": `attachment; filename="${filename}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
});
