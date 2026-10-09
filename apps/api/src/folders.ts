/** Small project folders: readable Markdown, reusable assets, and links to actionable guides. */
import { Hono } from "hono";
import { ATTACH_MAX, safeName, sniffAttachment } from "./attachments.js";
import { planNow } from "./quota.js";

type Env = { DB: D1Database; SHOTS?: R2Bucket };
type Vars = { account: string };
type Context = { Bindings: Env; Variables: Vars };
type Folder = {
  id: string;
  created_by: string;
  team_id: string;
  title: string;
  description: string;
  created: string;
  updated: string;
};
type Document = {
  id: string;
  folder_id: string;
  name: string;
  body: string;
  version: number;
  updated_by: string;
  created: string;
  updated: string;
};
type Asset = {
  id: string;
  folder_id: string;
  name: string;
  type: string;
  bytes: number;
  uploaded_by: string;
  created: string;
};

const routes = new Hono<Context>();
const id = () => {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
};
const now = () => new Date().toISOString();
const message = (
  c: { json: (v: unknown, status: number) => Response },
  status: number,
  text: string,
) => c.json({ message: text }, status);
const titleOf = (value: unknown, limit = 100) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const assetKey = (folder: string, asset: string) => `folders/${folder}/${asset}`;

export async function visible(c: { env: Env; get: (key: "account") => string }, folderId: string) {
  const folder = await c.env.DB.prepare("SELECT * FROM folder WHERE id = ?")
    .bind(folderId)
    .first<Folder>();
  if (!folder) return null;
  if (!folder.team_id) return folder.created_by === c.get("account") ? folder : null;
  const member = await c.env.DB.prepare(
    "SELECT 1 FROM membership WHERE team_id = ? AND account_id = ?",
  )
    .bind(folder.team_id, c.get("account"))
    .first();
  return member ? folder : null;
}

async function documentIn(c: { env: Env }, folder: string, document: string) {
  return c.env.DB.prepare("SELECT * FROM folder_document WHERE folder_id = ? AND id = ?")
    .bind(folder, document)
    .first<Document>();
}

export async function writable(c: { env: Env }, folder: Folder): Promise<boolean> {
  if (!folder.team_id) return true;
  const team = await c.env.DB.prepare("SELECT plan, plan_until FROM team WHERE id = ?")
    .bind(folder.team_id)
    .first<{ plan: string; plan_until: string }>();
  return Boolean(team && planNow(team.plan, team.plan_until, now()) !== "lapsed");
}

routes.get("/", async (c) => {
  const scope = c.req.query("scope") || "all";
  const me = c.get("account");
  let where =
    "(f.team_id = '' AND f.created_by = ?) OR EXISTS (SELECT 1 FROM membership m WHERE m.team_id = f.team_id AND m.account_id = ?)";
  let values: string[] = [me, me];
  if (scope === "mine") {
    where = "f.team_id = '' AND f.created_by = ?";
    values = [me];
  } else if (scope !== "all") {
    const team = await c.env.DB.prepare(
      "SELECT t.id FROM team t JOIN membership m ON m.team_id = t.id WHERE t.slug = ? AND m.account_id = ?",
    )
      .bind(scope, me)
      .first<{ id: string }>();
    if (!team) return message(c, 404, "That team isn't available to you.");
    where = "f.team_id = ?";
    values = [team.id];
  }
  const { results } = await c.env.DB.prepare(
    `SELECT f.id, f.title, f.description, f.team_id, f.created_by, f.created, f.updated,
            COALESCE(t.name, '') AS team_name, COALESCE(t.slug, '') AS team_slug,
            (SELECT COUNT(*) FROM folder_document d WHERE d.folder_id = f.id) AS documents,
            (SELECT COUNT(*) FROM folder_asset a WHERE a.folder_id = f.id) AS assets,
            (SELECT COUNT(*) FROM folder_guide g WHERE g.folder_id = f.id) AS guides
       FROM folder f LEFT JOIN team t ON t.id = f.team_id
      WHERE ${where}
      ORDER BY f.updated DESC LIMIT 200`,
  )
    .bind(...values)
    .all<
      Folder & {
        team_name: string;
        team_slug: string;
        documents: number;
        assets: number;
        guides: number;
      }
    >();
  return c.json({ folders: results });
});

routes.post("/", async (c) => {
  const input = await c.req
    .json<{ title?: unknown; description?: unknown; team?: unknown }>()
    .catch(() => null);
  const title = titleOf(input?.title);
  if (!title) return message(c, 400, "Give the folder a name.");
  const description = titleOf(input?.description, 400);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM folder WHERE created_by = ?")
    .bind(c.get("account"))
    .first<{ n: number }>();
  if ((count?.n || 0) >= 100)
    return message(c, 409, "You have 100 folders already. Use one of those for this project.");
  const teamSlug = titleOf(input?.team, 40);
  let teamId = "";
  if (teamSlug) {
    const team = await c.env.DB.prepare(
      "SELECT t.id, t.plan, t.plan_until FROM team t JOIN membership m ON m.team_id = t.id WHERE t.slug = ? AND m.account_id = ?",
    )
      .bind(teamSlug, c.get("account"))
      .first<{ id: string; plan: string; plan_until: string }>();
    if (!team) return message(c, 404, "That team isn't available to you.");
    if (planNow(team.plan, team.plan_until, now()) === "lapsed")
      return message(
        c,
        402,
        "This team's plan has lapsed. Its folders can still be read, but not changed.",
      );
    teamId = team.id;
  }
  const folder: Folder = {
    id: id(),
    created_by: c.get("account"),
    team_id: teamId,
    title,
    description,
    created: now(),
    updated: now(),
  };
  await c.env.DB.prepare(
    "INSERT INTO folder (id, created_by, team_id, title, description, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      folder.id,
      folder.created_by,
      folder.team_id,
      title,
      description,
      folder.created,
      folder.updated,
    )
    .run();
  return c.json({ folder }, 201);
});

routes.get("/:folder", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  const ownership = folder.team_id
    ? await c.env.DB.prepare("SELECT role FROM membership WHERE team_id = ? AND account_id = ?")
        .bind(folder.team_id, c.get("account"))
        .first<{ role: string }>()
    : null;
  const team = folder.team_id
    ? await c.env.DB.prepare("SELECT slug FROM team WHERE id = ?")
        .bind(folder.team_id)
        .first<{ slug: string }>()
    : null;
  const [documents, assets, guides] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, name, version, updated_by, created, updated FROM folder_document WHERE folder_id = ? ORDER BY updated DESC",
    )
      .bind(folder.id)
      .all(),
    c.env.DB.prepare("SELECT * FROM folder_asset WHERE folder_id = ? ORDER BY created DESC")
      .bind(folder.id)
      .all<Asset>(),
    c.env.DB.prepare(
      "SELECT g.id, g.title, g.kind, g.summary, g.status FROM folder_guide fg JOIN guide g ON g.id = fg.guide_id WHERE fg.folder_id = ? ORDER BY fg.added DESC",
    )
      .bind(folder.id)
      .all(),
  ]);
  return c.json({
    folder: {
      ...folder,
      team_slug: team?.slug || "",
      manage: folder.created_by === c.get("account") || ownership?.role === "owner",
    },
    documents: documents.results,
    assets: assets.results,
    guides: guides.results,
  });
});

routes.post("/:folder/documents", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  if (!(await writable(c, folder)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its folders can still be read, but not changed.",
    );
  const input = await c.req.json<{ name?: unknown; body?: unknown }>().catch(() => null);
  const name = titleOf(input?.name, 120);
  if (!name || name.includes("/") || name.includes("\\"))
    return message(c, 400, "Give the document a name without a path.");
  const body = typeof input?.body === "string" ? input.body : "";
  if (body.length > 256 * 1024) return message(c, 413, "That document is too large for a folder.");
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM folder_document WHERE folder_id = ?",
  )
    .bind(folder.id)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 100) return message(c, 409, "This folder has 100 documents already.");
  const doc: Document = {
    id: id(),
    folder_id: folder.id,
    name,
    body,
    version: 1,
    updated_by: c.get("account"),
    created: now(),
    updated: now(),
  };
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO folder_document (id, folder_id, name, body, version, updated_by, created, updated) VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
      ).bind(doc.id, folder.id, name, body, doc.updated_by, doc.created, doc.updated),
      c.env.DB.prepare(
        "INSERT INTO folder_document_revision (document_id, version, body, saved_by, saved_at) VALUES (?, 1, ?, ?, ?)",
      ).bind(doc.id, body, doc.updated_by, doc.updated),
      c.env.DB.prepare("UPDATE folder SET updated = ? WHERE id = ?").bind(doc.updated, folder.id),
    ]);
  } catch {
    return message(c, 409, "A document with that name is already in this folder.");
  }
  return c.json({ document: doc }, 201);
});

routes.get("/:folder/documents/:document", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  const document = await documentIn(c, folder.id, c.req.param("document"));
  return document ? c.json({ document }) : message(c, 404, "That document isn't in this folder.");
});

routes.put("/:folder/documents/:document", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  if (!(await writable(c, folder)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its folders can still be read, but not changed.",
    );
  const input = await c.req.json<{ body?: unknown; version?: unknown }>().catch(() => null);
  if (
    typeof input?.body !== "string" ||
    !Number.isInteger(input.version) ||
    Number(input.version) < 1
  )
    return message(c, 400, "Send the document text and the version you opened.");
  if (input.body.length > 256 * 1024)
    return message(c, 413, "That document is too large for a folder.");
  const at = now();
  const documentId = c.req.param("document");
  // Both statements share one D1 transaction: a saved version never exists without its revision.
  const [updated] = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE folder_document SET body = ?, version = version + 1, updated_by = ?, updated = ? WHERE id = ? AND folder_id = ? AND version = ?",
    ).bind(input.body, c.get("account"), at, documentId, folder.id, input.version),
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO folder_document_revision (document_id, version, body, saved_by, saved_at) SELECT id, version, body, updated_by, updated FROM folder_document WHERE id = ? AND folder_id = ? AND version = ?",
    ).bind(documentId, folder.id, Number(input.version) + 1),
  ]);
  if (!updated?.meta.changes) {
    const exists = await documentIn(c, folder.id, c.req.param("document"));
    return message(
      c,
      exists ? 409 : 404,
      exists
        ? "Someone saved a newer version. Reopen the document before saving."
        : "That document isn't in this folder.",
    );
  }
  const result = await documentIn(c, folder.id, documentId);
  await c.env.DB.prepare("UPDATE folder SET updated = ? WHERE id = ?").bind(at, folder.id).run();
  return c.json({ document: result });
});

routes.get("/:folder/documents/:document/revisions", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  const document = await documentIn(c, folder.id, c.req.param("document"));
  if (!document) return message(c, 404, "That document isn't in this folder.");
  const { results } = await c.env.DB.prepare(
    "SELECT version, saved_by, saved_at FROM folder_document_revision WHERE document_id = ? ORDER BY version DESC LIMIT 50",
  )
    .bind(document.id)
    .all();
  return c.json({ revisions: results });
});

routes.get("/:folder/documents/:document/revisions/:version", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  const document = await documentIn(c, folder.id, c.req.param("document"));
  if (!document) return message(c, 404, "That document isn't in this folder.");
  const revision = await c.env.DB.prepare(
    "SELECT version, body, saved_by, saved_at FROM folder_document_revision WHERE document_id = ? AND version = ?",
  )
    .bind(document.id, c.req.param("version"))
    .first();
  return revision ? c.json({ revision }) : message(c, 404, "That version isn't available.");
});

routes.delete("/:folder/documents/:document", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  if (!(await writable(c, folder)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its folders can still be read, but not changed.",
    );
  const result = await c.env.DB.prepare(
    "DELETE FROM folder_document WHERE folder_id = ? AND id = ?",
  )
    .bind(folder.id, c.req.param("document"))
    .run();
  if (!result.meta.changes) return message(c, 404, "That document isn't in this folder.");
  await c.env.DB.prepare("UPDATE folder SET updated = ? WHERE id = ?").bind(now(), folder.id).run();
  return c.json({ removed: true });
});

/** Images are checked by their signatures, not the name or sender's Content-Type. */
function imageType(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38) && (bytes[4] === 0x37 || bytes[4] === 0x39))
    return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
    return "image/webp";
  return null;
}

export function folderAssetType(bytes: Uint8Array, declared: string, name: string): string | null {
  return imageType(bytes) || sniffAttachment(bytes, declared, name);
}

/** Store validated bytes for a folder, whether a signed-in client or a one-time link sent them. */
export async function storeFolderAsset(
  env: Env,
  folder: string,
  account: string,
  raw: ArrayBuffer,
  requested: string,
  type: string,
): Promise<{ asset?: Asset; error?: string; status?: number }> {
  if (!env.SHOTS) return { error: "File storage isn't available right now.", status: 501 };
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM folder_asset WHERE folder_id = ?")
    .bind(folder)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 100) return { error: "This folder has 100 files already.", status: 409 };
  const asset: Asset = {
    id: id(),
    folder_id: folder,
    name: safeName(requested, type),
    type,
    bytes: raw.byteLength,
    uploaded_by: account,
    created: now(),
  };
  await env.SHOTS.put(assetKey(folder, asset.id), raw, { httpMetadata: { contentType: type } });
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO folder_asset (id, folder_id, name, type, bytes, uploaded_by, created) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(asset.id, folder, asset.name, type, asset.bytes, account, asset.created),
      env.DB.prepare("UPDATE folder SET updated = ? WHERE id = ?").bind(asset.created, folder),
    ]);
  } catch (error) {
    await env.SHOTS.delete(assetKey(folder, asset.id));
    throw error;
  }
  return { asset };
}

routes.post("/:folder/assets", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  if (!(await writable(c, folder)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its folders can still be read, but not changed.",
    );
  const raw = await c.req.arrayBuffer();
  if (!raw.byteLength) return message(c, 400, "Choose a file that isn't empty.");
  if (raw.byteLength > ATTACH_MAX) return message(c, 413, "That file is over 10 MB.");
  const requested = c.req.header("x-file-name") || "";
  const type = folderAssetType(new Uint8Array(raw), c.req.header("content-type") || "", requested);
  if (!type) return message(c, 415, "Use an image, PDF, ZIP or text file.");
  const stored = await storeFolderAsset(c.env, folder.id, c.get("account"), raw, requested, type);
  return stored.error
    ? message(c, stored.status || 500, stored.error)
    : c.json({ asset: stored.asset }, 201);
});

routes.get("/:folder/assets/:asset", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  const asset = await c.env.DB.prepare("SELECT * FROM folder_asset WHERE folder_id = ? AND id = ?")
    .bind(folder.id, c.req.param("asset"))
    .first<Asset>();
  if (!asset || !c.env.SHOTS) return message(c, 404, "That file isn't in this folder.");
  const object = await c.env.SHOTS.get(assetKey(folder.id, asset.id));
  if (!object) return message(c, 404, "That file isn't available right now.");
  return new Response(object.body, {
    headers: {
      "content-type": asset.type,
      "content-disposition": `attachment; filename="${safeName(asset.name, asset.type)}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
    },
  });
});

/** A bounded representation an MCP tool can hand to an agent as an image or text block. */
routes.get("/:folder/assets/:asset/agent", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  const asset = await c.env.DB.prepare("SELECT * FROM folder_asset WHERE folder_id = ? AND id = ?")
    .bind(folder.id, c.req.param("asset"))
    .first<Asset>();
  if (!asset || !c.env.SHOTS) return message(c, 404, "That file isn't in this folder.");
  const image = asset.type.startsWith("image/");
  const readable = asset.type.startsWith("text/") || asset.type === "application/json";
  if (!image && !readable)
    return message(
      c,
      415,
      "This file can be downloaded with a Passalong token, but isn't an image or text an agent can read here.",
    );
  if (asset.bytes > (image ? 5 * 1024 * 1024 : 256 * 1024))
    return message(
      c,
      413,
      "This file is too large to put in an agent's context. Download it instead.",
    );
  const object = await c.env.SHOTS.get(assetKey(folder.id, asset.id));
  if (!object) return message(c, 404, "That file isn't available right now.");
  if (!image)
    return c.json({ id: asset.id, name: asset.name, type: asset.type, text: await object.text() });
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return c.json({ id: asset.id, name: asset.name, type: asset.type, data: btoa(binary) });
});

routes.delete("/:folder/assets/:asset", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  if (!(await writable(c, folder)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its folders can still be read, but not changed.",
    );
  const asset = await c.env.DB.prepare("SELECT id FROM folder_asset WHERE folder_id = ? AND id = ?")
    .bind(folder.id, c.req.param("asset"))
    .first<{ id: string }>();
  if (!asset) return message(c, 404, "That file isn't in this folder.");
  if (!c.env.SHOTS) return message(c, 501, "File storage isn't available right now.");
  await c.env.SHOTS.delete(assetKey(folder.id, asset.id));
  await c.env.DB.prepare("DELETE FROM folder_asset WHERE id = ?").bind(asset.id).run();
  await c.env.DB.prepare("UPDATE folder SET updated = ? WHERE id = ?").bind(now(), folder.id).run();
  return c.json({ removed: true });
});

routes.post("/:folder/guides", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  if (!(await writable(c, folder)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its folders can still be read, but not changed.",
    );
  const input = await c.req.json<{ guide?: unknown }>().catch(() => null);
  const guideId = titleOf(input?.guide, 16);
  const guide = await c.env.DB.prepare("SELECT id, account_id, team_id FROM guide WHERE id = ?")
    .bind(guideId)
    .first<{ id: string; account_id: string; team_id: string }>();
  if (
    !guide ||
    (folder.team_id
      ? guide.team_id !== folder.team_id
      : guide.account_id !== c.get("account") || Boolean(guide.team_id))
  )
    return message(c, 404, "That guide can't be added to this folder.");
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO folder_guide (folder_id, guide_id, added_by, added) VALUES (?, ?, ?, ?)",
  )
    .bind(folder.id, guideId, c.get("account"), now())
    .run();
  await c.env.DB.prepare("UPDATE folder SET updated = ? WHERE id = ?").bind(now(), folder.id).run();
  return c.json({ guide: guideId }, 201);
});

routes.delete("/:folder/guides/:guide", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  if (!(await writable(c, folder)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its folders can still be read, but not changed.",
    );
  await c.env.DB.prepare("DELETE FROM folder_guide WHERE folder_id = ? AND guide_id = ?")
    .bind(folder.id, c.req.param("guide"))
    .run();
  return c.json({ removed: true });
});

routes.delete("/:folder", async (c) => {
  const folder = await visible(c, c.req.param("folder"));
  if (!folder) return message(c, 404, "That folder isn't available to you.");
  if (!(await writable(c, folder)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its folders can still be read, but not changed.",
    );
  if (folder.created_by !== c.get("account")) {
    const owner = await c.env.DB.prepare(
      "SELECT 1 FROM membership WHERE team_id = ? AND account_id = ? AND role = 'owner'",
    )
      .bind(folder.team_id, c.get("account"))
      .first();
    if (!owner)
      return message(c, 403, "Only the person who made this folder or a team owner can delete it.");
  }
  const { results } = await c.env.DB.prepare("SELECT id FROM folder_asset WHERE folder_id = ?")
    .bind(folder.id)
    .all<{ id: string }>();
  if (results.length && !c.env.SHOTS)
    return message(c, 501, "File storage isn't available right now.");
  if (results.length) await c.env.SHOTS?.delete(results.map((a) => assetKey(folder.id, a.id)));
  await c.env.DB.prepare("DELETE FROM folder WHERE id = ?").bind(folder.id).run();
  return c.json({ removed: true });
});

export default routes;
