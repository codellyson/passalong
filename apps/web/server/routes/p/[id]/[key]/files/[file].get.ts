// A file from a shared folder, saved rather than shown: the same headers as the signed-in download
// in apps/api/src/folders.ts. The key opens only files in the shared folder's subtree.

import { db } from "../../../../../utils/d1";
import { sharedFolder } from "../../../../../utils/shared-folder";

interface R2Object {
  body: ReadableStream;
}

export default defineEventHandler(async (event) => {
  const { tree } = await sharedFolder(
    event,
    getRouterParam(event, "id") || "",
    getRouterParam(event, "key") || "",
  );
  const asset = await db(event)
    .prepare("SELECT id, folder_id, name, type FROM folder_asset WHERE id = ?")
    .bind(getRouterParam(event, "asset") || "")
    .first<{ id: string; folder_id: string; name: string; type: string }>();
  if (!asset || !tree.some((f) => f.id === asset.folder_id))
    throw createError({ statusCode: 404, statusMessage: "no such file" });
  const shots = (
    event.context.cloudflare as { env?: { SHOTS?: { get(key: string): Promise<R2Object | null> } } }
  )?.env?.SHOTS;
  const object = await shots?.get(`folders/${asset.folder_id}/${asset.id}`);
  if (!object) throw createError({ statusCode: 404, statusMessage: "no such file" });
  // A quoted filename with nothing that could close the quote or start a header.
  const filename = asset.name.replace(/["\\\r\n]/g, "_") || "file";
  return new Response(object.body, {
    headers: {
      "content-type": asset.type,
      "content-disposition": `attachment; filename="${filename}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
});
