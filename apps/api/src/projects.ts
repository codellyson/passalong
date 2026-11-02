/** Small projects: readable Markdown, their files, and links to actionable work. */
import { Hono } from "hono";
import { ATTACH_MAX, safeName, sniffAttachment } from "./attachments.js";
import { mintOrigin } from "./hosts.js";
import { changeWords } from "./needs.js";
import { docChange, projectView, SAVER, seeDocument } from "./project.js";
import { findVisible, moveProblem, type Project, repoOf } from "./project-tree.js";
import { planNow } from "./quota.js";
import { tagList } from "./work.js";

type Env = { DB: D1Database; SHOTS?: R2Bucket; PUBLIC_ORIGIN?: string };
type Vars = { account: string; client?: string };
type Context = { Bindings: Env; Variables: Vars };
type Document = {
  id: string;
  project_id: string;
  name: string;
  body: string;
  version: number;
  updated_by: string;
  created: string;
  updated: string;
};
type StoredFile = {
  id: string;
  project_id: string;
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
const COLORS = new Set(["", "coral", "amber", "green", "blue", "violet", "teal", "stone"]);
const REPO_PROBLEM =
  "Write the repo as one address, like github.com/acme/billing, in 200 characters or fewer.";
const colorOf = (value: unknown) => (typeof value === "string" && COLORS.has(value) ? value : null);
const fileKey = (project: string, file: string) => `projects/${project}/${file}`;

export async function visible(c: { env: Env; get: (key: "account") => string }, projectId: string) {
  return findVisible(c.env.DB, c.get("account"), projectId);
}

async function documentIn(c: { env: Env }, project: string, document: string) {
  return c.env.DB.prepare("SELECT * FROM document WHERE project_id = ? AND id = ?")
    .bind(project, document)
    .first<Document>();
}

export async function writable(c: { env: Env }, project: Project): Promise<boolean> {
  if (!project.team_id) return true;
  const team = await c.env.DB.prepare("SELECT plan, plan_until FROM team WHERE id = ?")
    .bind(project.team_id)
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
  // Two filters an agent needs to find its way back: the projects a piece of work sits in, and the
  // projects whose name or description, or any document's name or text, mention some words.
  const work = c.req.query("work") || "";
  if (work) {
    where = `(${where}) AND EXISTS (SELECT 1 FROM project_work fg WHERE fg.project_id = f.id AND fg.work_id = ?)`;
    values.push(work);
  }
  const words = (c.req.query("q") || "").trim().slice(0, 100);
  const like = `%${words.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  if (words) {
    where = `(${where}) AND (f.title LIKE ? ESCAPE '\\' OR f.description LIKE ? ESCAPE '\\' OR EXISTS (
      SELECT 1 FROM document d WHERE d.project_id = f.id AND (d.name LIKE ? ESCAPE '\\' OR d.body LIKE ? ESCAPE '\\')))`;
    values.push(like, like, like, like);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT f.id, f.title, f.description, f.parent_id, f.color, f.repo, f.team_id, f.created_by, f.created, f.updated,
            COALESCE(t.name, '') AS team_name, COALESCE(t.slug, '') AS team_slug,
            CASE WHEN f.created_by = ? OR EXISTS (
              SELECT 1 FROM membership owner WHERE owner.team_id = f.team_id AND owner.account_id = ? AND owner.role = 'owner'
            ) THEN 1 ELSE 0 END AS manage,
            (SELECT COUNT(*) FROM document d WHERE d.project_id = f.id) AS documents,
            (SELECT COUNT(*) FROM project_file a WHERE a.project_id = f.id) AS files,
            (SELECT COUNT(*) FROM project_work g WHERE g.project_id = f.id) AS work,
            (SELECT COUNT(*) FROM project_work l JOIN work w ON w.id = l.work_id
              WHERE l.project_id = f.id AND w.status <> 'done') AS open,
            -- Changed since you last looked: unread news on its work, or a document someone else
            -- saved after you last opened it (project.ts, docChange). What changed is named.
            (EXISTS (SELECT 1 FROM project_work l JOIN notification n ON n.work_id = l.work_id
              WHERE l.project_id = f.id AND n.account_id = ? AND n.read_at = '')
             OR EXISTS (SELECT 1 FROM document d WHERE d.project_id = f.id AND ${docChange("?")} <> '')) AS changed,
            COALESCE((SELECT d.name FROM document d WHERE d.project_id = f.id AND ${docChange("?")} <> ''
                       ORDER BY d.updated DESC LIMIT 1),
                     (SELECT w.title FROM project_work l JOIN work w ON w.id = l.work_id
                        JOIN notification n ON n.work_id = w.id
                       WHERE l.project_id = f.id AND n.account_id = ? AND n.read_at = ''
                       ORDER BY n.at DESC LIMIT 1), '') AS changed_what,
            -- The last document version saved in it, by whom: the list's "Last change".
            COALESCE((SELECT json_object('name', d.name, 'by', ${SAVER}, 'at', r.saved_at)
                FROM document_revision r JOIN document d ON d.id = r.document_id
                LEFT JOIN account a ON a.id = r.saved_by
               WHERE d.project_id = f.id ORDER BY r.saved_at DESC LIMIT 1), '') AS last_change${
                 words
                   ? `,
            (SELECT json_group_array(json_object('id', d.id, 'name', d.name)) FROM document d
              WHERE d.project_id = f.id AND (d.name LIKE ? ESCAPE '\\' OR d.body LIKE ? ESCAPE '\\')) AS matches`
                   : ""
}
       FROM project f LEFT JOIN team t ON t.id = f.team_id
      WHERE ${where}
      ORDER BY f.updated DESC`,
  )
    .bind(...Array(8).fill(me), ...(words ? [like, like] : []), ...values)
    .all<
      Project & {
        team_name: string;
        team_slug: string;
        documents: number;
        files: number;
        work: number;
        open: number;
        changed: number;
        changed_what: string;
        last_change: string;
        matches?: string;
      }
    >();
  // With words, each project also names the documents that matched, so the next call can open one.
  return c.json({
    projects: results.map((f) => ({
      ...f,
      last_change: f.last_change ? JSON.parse(f.last_change) : null,
      ...(words ? { matches: JSON.parse(f.matches || "[]") } : {}),
    })),
  });
});

routes.post("/", async (c) => {
  const input = await c.req
    .json<{
      title?: unknown;
      description?: unknown;
      team?: unknown;
      parent?: unknown;
      color?: unknown;
      repo?: unknown;
    }>()
    .catch(() => null);
  const title = titleOf(input?.title);
  if (!title) return message(c, 400, "Give the project a name.");
  if (input && Object.hasOwn(input, "parent") && typeof input.parent !== "string")
    return message(c, 400, "Choose the project it goes inside by id.");
  const description = titleOf(input?.description, 400);
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM project WHERE created_by = ?")
    .bind(c.get("account"))
    .first<{ n: number }>();
  if ((count?.n || 0) >= 100)
    return message(c, 409, "You have 100 projects already. Use one of those for this.");
  const parentId = titleOf(input?.parent, 32);
  const teamSlug = titleOf(input?.team, 40);
  let teamId = "";
  let parent: Project | null = null;
  if (parentId) {
    parent = await visible(c, parentId);
    if (!parent) return message(c, 404, "The project it goes inside isn't available to you.");
    if (!(await writable(c, parent)))
      return message(c, 402, "This project can't be changed right now.");
    teamId = parent.team_id;
  }
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
        "This team's plan has lapsed. Its projects can still be read, but not changed.",
      );
    if (parent && team.id !== parent.team_id)
      return message(c, 409, "A project inside another must stay in its team.");
    teamId = team.id;
  }
  const color = input && Object.hasOwn(input, "color") ? colorOf(input.color) : "";
  if (color === null) return message(c, 400, "Choose a supported project colour.");
  const repo = repoOf(input?.repo);
  if (repo === null) return message(c, 400, REPO_PROBLEM);
  const project: Project = {
    id: id(),
    created_by: c.get("account"),
    team_id: teamId,
    title,
    description,
    parent_id: parentId,
    color,
    repo,
    share_key: "",
    created: now(),
    updated: now(),
  };
  await c.env.DB.prepare(
    "INSERT INTO project (id, created_by, team_id, title, description, parent_id, color, repo, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      project.id,
      project.created_by,
      project.team_id,
      title,
      description,
      parentId,
      color,
      repo,
      project.created,
      project.updated,
    )
    .run();
  return c.json({ project: { ...project, space: await spaceOf(c, project.team_id) } }, 201);
});

routes.patch("/:project", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(c, 402, "This project can't be changed right now.");
  const input = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (
    !input ||
    !Object.keys(input).some((key) =>
      ["title", "description", "parent", "color", "repo"].includes(key),
    )
  )
    return message(c, 400, "Choose a project change.");
  if (Object.hasOwn(input, "parent") && typeof input.parent !== "string")
    return message(c, 400, "Choose the project it goes inside by id.");
  const title = Object.hasOwn(input, "title") ? titleOf(input.title) : project.title;
  if (!title) return message(c, 400, "Give the project a name.");
  const description = Object.hasOwn(input, "description")
    ? titleOf(input.description, 400)
    : project.description;
  const color = Object.hasOwn(input, "color") ? colorOf(input.color) : project.color;
  if (color === null) return message(c, 400, "Choose a supported project colour.");
  const repo = Object.hasOwn(input, "repo") ? repoOf(input.repo) : project.repo;
  if (repo === null) return message(c, 400, REPO_PROBLEM);
  const parentId = Object.hasOwn(input, "parent") ? titleOf(input.parent, 32) : project.parent_id;
  const problem = await moveProblem(c.env.DB, c.get("account"), project, parentId);
  if (problem) return message(c, problem.status, problem.message);
  const updated = now();
  await c.env.DB.prepare(
    "UPDATE project SET title = ?, description = ?, parent_id = ?, color = ?, repo = ?, updated = ? WHERE id = ?",
  )
    .bind(title, description, parentId, color, repo, updated, project.id)
    .run();
  return c.json({
    project: { ...project, title, description, parent_id: parentId, color, repo, updated },
  });
});

/**
 * Where a project lives, in words an agent can repeat to a person: "private", or the team's name and
 * slug. It is on every answer that makes or reads one project, because an agent that is not told
 * reports what it assumed — one said "in the team space" about a project it had made private.
 */
async function spaceOf(c: { env: Env }, teamId: string) {
  if (!teamId) return "private (only you can see it)";
  const team = await c.env.DB.prepare("SELECT name, slug FROM team WHERE id = ?")
    .bind(teamId)
    .first<{ name: string; slug: string }>();
  return team ? `team ${team.name || team.slug} (${team.slug}), every member can see it` : "team";
}

// A project's share link, the way work.s does: /p/:id/:key, readable by whoever holds it with no
// account. Anyone who may change the project may share it or stop sharing it — the same people who
// could copy its files out anyway. Stopping clears the key, so every copy of the old link dies; a
// later share mints a new one rather than bringing the old one back.
const shareUrl = (
  c: { env: Env; req: { url: string } },
  project: { id: string; share_key: string },
) =>
  project.share_key
    ? `${mintOrigin(c.env.PUBLIC_ORIGIN, c.req.url)}/p/${project.id}/${project.share_key}`
    : "";

routes.post("/:project/share", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  const share_key = project.share_key || `${id()}${id()}`.slice(0, 22);
  if (!project.share_key)
    await c.env.DB.prepare("UPDATE project SET share_key = ? WHERE id = ?")
      .bind(share_key, project.id)
      .run();
  return c.json({ url: shareUrl(c, { id: project.id, share_key }) });
});

routes.delete("/:project/share", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  await c.env.DB.prepare("UPDATE project SET share_key = '' WHERE id = ?").bind(project.id).run();
  return c.json({ url: "" });
});

routes.get("/:project", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  const ownership = project.team_id
    ? await c.env.DB.prepare("SELECT role FROM membership WHERE team_id = ? AND account_id = ?")
        .bind(project.team_id, c.get("account"))
        .first<{ role: string }>()
    : null;
  const team = project.team_id
    ? await c.env.DB.prepare("SELECT slug FROM team WHERE id = ?")
        .bind(project.team_id)
        .first<{ slug: string }>()
    : null;
  const [documents, files, work, children, ancestors] = await Promise.all([
    c.env.DB.prepare(
      // With who last saved each and whether that was a person in the hub or an agent.
      `SELECT d.id, d.name, d.version, d.updated_by, d.created, d.updated,
              COALESCE(NULLIF(a.name, ''), CASE WHEN a.handle <> '' THEN '@' || a.handle END, '') AS editor,
              COALESCE((SELECT r.client FROM document_revision r WHERE r.document_id = d.id
                         ORDER BY r.version DESC LIMIT 1), '') AS client,
              ${docChange("?2")} AS changed
         FROM document d LEFT JOIN account a ON a.id = d.updated_by
        WHERE d.project_id = ?1 ORDER BY d.updated DESC`,
    )
      .bind(project.id, c.get("account"))
      .all(),
    c.env.DB.prepare("SELECT * FROM project_file WHERE project_id = ? ORDER BY created DESC")
      .bind(project.id)
      .all<StoredFile>(),
    c.env.DB.prepare(
      "SELECT g.id, g.title, g.summary, g.status, g.tags FROM project_work fg JOIN work g ON g.id = fg.work_id WHERE fg.project_id = ? ORDER BY fg.added DESC",
    )
      .bind(project.id)
      .all<{ id: string; title: string; summary: string; status: string; tags: string }>(),
    c.env.DB.prepare(
      // With what each holds, so a project that only groups others can show what is in them.
      `SELECT f.id, f.title, f.description, f.parent_id, f.color,
              (SELECT COUNT(*) FROM document d WHERE d.project_id = f.id) AS documents,
              (SELECT COUNT(*) FROM project_file a WHERE a.project_id = f.id) AS files,
              (SELECT COUNT(*) FROM project_work g WHERE g.project_id = f.id) AS work,
              (SELECT COUNT(*) FROM project s WHERE s.parent_id = f.id) AS subprojects
         FROM project f WHERE f.parent_id = ? ORDER BY f.title COLLATE NOCASE`,
    )
      .bind(project.id)
      .all(),
    c.env.DB.prepare(
      `WITH RECURSIVE chain(id, title, parent_id, color, depth) AS (
         SELECT id, title, parent_id, color, 0 FROM project WHERE id = ?
         UNION ALL SELECT f.id, f.title, f.parent_id, f.color, chain.depth + 1
         FROM project f JOIN chain ON f.id = chain.parent_id
       ) SELECT id, title, color FROM chain ORDER BY depth DESC`,
    )
      .bind(project.id)
      .all(),
  ]);
  return c.json({
    project: {
      ...project,
      team_slug: team?.slug || "",
      manage: project.created_by === c.get("account") || ownership?.role === "owner",
      share_url: shareUrl(c, project),
      space: await spaceOf(c, project.team_id),
    },
    documents: documents.results,
    files: files.results,
    // The label its agent gave each piece of work, normalised as summaries() does.
    work: work.results.map((g) => ({ ...g, tags: tagList(JSON.parse(g.tags || "[]")) })),
    children: children.results,
    breadcrumbs: ancestors.results,
  });
});

// A project's work as register rows and its history, in one read (project.ts).
routes.get("/:project/project", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  const view = await projectView(c.env.DB, c.get("account"), project.id, now());
  const words = <T extends { changed: string }>(r: T) => ({
    ...r,
    changed: changeWords(r.changed),
  });
  return c.json({
    open: view.open.map(words),
    done: view.done.map(words),
    // A document's change is already in words; finished work's is a notification kind.
    history: view.history.map((h) => (h.kind === "finished" ? words(h) : h)),
  });
});

routes.post("/:project/documents", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  const input = await c.req.json<{ name?: unknown; body?: unknown }>().catch(() => null);
  const name = titleOf(input?.name, 120);
  if (!name || name.includes("/") || name.includes("\\"))
    return message(c, 400, "Give the document a name without a path.");
  const body = typeof input?.body === "string" ? input.body : "";
  if (body.length > 256 * 1024) return message(c, 413, "That document is too large for a project.");
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM document WHERE project_id = ?")
    .bind(project.id)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 100) return message(c, 409, "This project has 100 documents already.");
  const doc: Document = {
    id: id(),
    project_id: project.id,
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
        "INSERT INTO document (id, project_id, name, body, version, updated_by, created, updated) VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
      ).bind(doc.id, project.id, name, body, doc.updated_by, doc.created, doc.updated),
      c.env.DB.prepare(
        "INSERT INTO document_revision (document_id, version, body, saved_by, saved_at, client) VALUES (?, 1, ?, ?, ?, ?)",
      ).bind(doc.id, body, doc.updated_by, doc.updated, c.get("client") || ""),
      c.env.DB.prepare("UPDATE project SET updated = ? WHERE id = ?").bind(doc.updated, project.id),
    ]);
  } catch {
    return message(c, 409, "A document with that name is already in this project.");
  }
  return c.json({ document: doc }, 201);
});

routes.get("/:project/documents/:document", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  const document = await documentIn(c, project.id, c.req.param("document"));
  return document ? c.json({ document }) : message(c, 404, "That document isn't in this project.");
});

// The hub opening a document: its change mark clears for this account. A route of its own rather
// than a side effect of reading, because an agent reading the page is not the person looking at it.
routes.put("/:project/documents/:document/seen", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  const document = await documentIn(c, project.id, c.req.param("document"));
  if (!document) return message(c, 404, "That document isn't in this project.");
  await seeDocument(c.env.DB, c.get("account"), document.id, now());
  return c.json({ seen: true });
});

routes.put("/:project/documents/:document", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  const input = await c.req.json<{ body?: unknown; version?: unknown }>().catch(() => null);
  if (
    typeof input?.body !== "string" ||
    !Number.isInteger(input.version) ||
    Number(input.version) < 1
  )
    return message(c, 400, "Send the document text and the version you opened.");
  if (input.body.length > 256 * 1024)
    return message(c, 413, "That document is too large for a project.");
  const at = now();
  const documentId = c.req.param("document");
  // Both statements share one D1 transaction: a saved version never exists without its revision.
  const [updated] = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE document SET body = ?, version = version + 1, updated_by = ?, updated = ? WHERE id = ? AND project_id = ? AND version = ?",
    ).bind(input.body, c.get("account"), at, documentId, project.id, input.version),
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO document_revision (document_id, version, body, saved_by, saved_at, client) SELECT id, version, body, updated_by, updated, ? FROM document WHERE id = ? AND project_id = ? AND version = ?",
    ).bind(c.get("client") || "", documentId, project.id, Number(input.version) + 1),
  ]);
  if (!updated?.meta.changes) {
    const exists = await documentIn(c, project.id, c.req.param("document"));
    return message(
      c,
      exists ? 409 : 404,
      exists
        ? "Someone saved a newer version. Reopen the document before saving."
        : "That document isn't in this project.",
    );
  }
  const result = await documentIn(c, project.id, documentId);
  await c.env.DB.prepare("UPDATE project SET updated = ? WHERE id = ?").bind(at, project.id).run();
  // Whoever saved it has seen it: the version they just wrote is not news to them.
  await seeDocument(c.env.DB, c.get("account"), documentId, at);
  return c.json({ document: result });
});

// Renaming and moving are not edits: neither takes a version, because neither can overwrite
// anybody's text, and both keep the document's id — so its history, keyed by that id, goes with it.
// A move stays within one space, as a project's does: putting a private document into a team project
// would share it, and that is a decision for a person, not a side effect of tidying.
routes.patch("/:project/documents/:document", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  const input = await c.req.json<{ name?: unknown; project?: unknown }>().catch(() => null);
  const document = await documentIn(c, project.id, c.req.param("document"));
  if (!document) return message(c, 404, "That document isn't in this project.");
  if (!input || (input.name === undefined && input.project === undefined))
    return message(c, 400, "Send a new name, a project to move it to, or both.");
  const name = input.name === undefined ? document.name : titleOf(input.name, 120);
  if (!name || name.includes("/") || name.includes("\\"))
    return message(c, 400, "Give the document a name without a path.");
  let target = project;
  if (input.project !== undefined) {
    if (typeof input.project !== "string" || !input.project)
      return message(c, 400, "Choose the project to move it to by id.");
    const found = await visible(c, input.project);
    if (!found || found.team_id !== project.team_id)
      return message(c, 404, "That project isn't available in this space.");
    if (!(await writable(c, found)))
      return message(
        c,
        402,
        "This team's plan has lapsed. Its projects can still be read, but not changed.",
      );
    target = found;
  }
  if (target.id !== project.id) {
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM document WHERE project_id = ?")
      .bind(target.id)
      .first<{ n: number }>();
    if ((count?.n || 0) >= 100) return message(c, 409, "That project has 100 documents already.");
  }
  const at = now();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE document SET name = ?, project_id = ?, updated = ? WHERE id = ? AND project_id = ?",
      ).bind(name, target.id, at, document.id, project.id),
      c.env.DB.prepare("UPDATE project SET updated = ? WHERE id IN (?, ?)").bind(
        at,
        project.id,
        target.id,
      ),
    ]);
  } catch {
    return message(
      c,
      409,
      target.id === project.id
        ? "A document with that name is already in this project."
        : "A document with that name is already in the project you are moving it to.",
    );
  }
  return c.json({ document: await documentIn(c, target.id, document.id), project: target.id });
});

routes.get("/:project/documents/:document/revisions", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  const document = await documentIn(c, project.id, c.req.param("document"));
  if (!document) return message(c, 404, "That document isn't in this project.");
  const { results } = await c.env.DB.prepare(
    "SELECT version, saved_by, saved_at FROM document_revision WHERE document_id = ? ORDER BY version DESC LIMIT 50",
  )
    .bind(document.id)
    .all();
  return c.json({ revisions: results });
});

routes.get("/:project/documents/:document/revisions/:version", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  const document = await documentIn(c, project.id, c.req.param("document"));
  if (!document) return message(c, 404, "That document isn't in this project.");
  const revision = await c.env.DB.prepare(
    "SELECT version, body, saved_by, saved_at FROM document_revision WHERE document_id = ? AND version = ?",
  )
    .bind(document.id, c.req.param("version"))
    .first();
  return revision ? c.json({ revision }) : message(c, 404, "That version isn't available.");
});

routes.delete("/:project/documents/:document", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  const result = await c.env.DB.prepare("DELETE FROM document WHERE project_id = ? AND id = ?")
    .bind(project.id, c.req.param("document"))
    .run();
  if (!result.meta.changes) return message(c, 404, "That document isn't in this project.");
  await c.env.DB.prepare("UPDATE project SET updated = ? WHERE id = ?")
    .bind(now(), project.id)
    .run();
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

export function projectFileType(bytes: Uint8Array, declared: string, name: string): string | null {
  return imageType(bytes) || sniffAttachment(bytes, declared, name);
}

/** Store validated bytes for a project, whether a signed-in client or a one-time link sent them. */
export async function storeProjectFile(
  env: Env,
  project: string,
  account: string,
  raw: ArrayBuffer,
  requested: string,
  type: string,
): Promise<{ file?: StoredFile; error?: string; status?: number }> {
  if (!env.SHOTS) return { error: "File storage isn't available right now.", status: 501 };
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM project_file WHERE project_id = ?")
    .bind(project)
    .first<{ n: number }>();
  if ((count?.n || 0) >= 100) return { error: "This project has 100 files already.", status: 409 };
  const file: StoredFile = {
    id: id(),
    project_id: project,
    name: safeName(requested, type),
    type,
    bytes: raw.byteLength,
    uploaded_by: account,
    created: now(),
  };
  await env.SHOTS.put(fileKey(project, file.id), raw, { httpMetadata: { contentType: type } });
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO project_file (id, project_id, name, type, bytes, uploaded_by, created) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(file.id, project, file.name, type, file.bytes, account, file.created),
      env.DB.prepare("UPDATE project SET updated = ? WHERE id = ?").bind(file.created, project),
    ]);
  } catch (error) {
    await env.SHOTS.delete(fileKey(project, file.id));
    throw error;
  }
  return { file };
}

routes.post("/:project/files", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  const raw = await c.req.arrayBuffer();
  if (!raw.byteLength) return message(c, 400, "Choose a file that isn't empty.");
  if (raw.byteLength > ATTACH_MAX) return message(c, 413, "That file is over 10 MB.");
  const requested = c.req.header("x-file-name") || "";
  const type = projectFileType(new Uint8Array(raw), c.req.header("content-type") || "", requested);
  if (!type) return message(c, 415, "Use an image, PDF, ZIP or text file.");
  const stored = await storeProjectFile(c.env, project.id, c.get("account"), raw, requested, type);
  return stored.error
    ? message(c, stored.status || 500, stored.error)
    : c.json({ file: stored.file }, 201);
});

routes.get("/:project/files/:file", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  const file = await c.env.DB.prepare("SELECT * FROM project_file WHERE project_id = ? AND id = ?")
    .bind(project.id, c.req.param("file"))
    .first<StoredFile>();
  if (!file || !c.env.SHOTS) return message(c, 404, "That file isn't in this project.");
  const object = await c.env.SHOTS.get(fileKey(project.id, file.id));
  if (!object) return message(c, 404, "That file isn't available right now.");
  return new Response(object.body, {
    headers: {
      "content-type": file.type,
      "content-disposition": `attachment; filename="${safeName(file.name, file.type)}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
    },
  });
});

/** A bounded representation an MCP tool can hand to an agent as an image or text block. */
routes.get("/:project/files/:file/agent", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  const file = await c.env.DB.prepare("SELECT * FROM project_file WHERE project_id = ? AND id = ?")
    .bind(project.id, c.req.param("file"))
    .first<StoredFile>();
  if (!file || !c.env.SHOTS) return message(c, 404, "That file isn't in this project.");
  const image = file.type.startsWith("image/");
  const readable = file.type.startsWith("text/") || file.type === "application/json";
  if (!image && !readable)
    return message(
      c,
      415,
      "This file can be downloaded with a Passalong token, but isn't an image or text an agent can read here.",
    );
  if (file.bytes > (image ? 5 * 1024 * 1024 : 256 * 1024))
    return message(
      c,
      413,
      "This file is too large to put in an agent's context. Download it instead.",
    );
  const object = await c.env.SHOTS.get(fileKey(project.id, file.id));
  if (!object) return message(c, 404, "That file isn't available right now.");
  if (!image)
    return c.json({ id: file.id, name: file.name, type: file.type, text: await object.text() });
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return c.json({ id: file.id, name: file.name, type: file.type, data: btoa(binary) });
});

routes.delete("/:project/files/:file", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  const file = await c.env.DB.prepare("SELECT id FROM project_file WHERE project_id = ? AND id = ?")
    .bind(project.id, c.req.param("file"))
    .first<{ id: string }>();
  if (!file) return message(c, 404, "That file isn't in this project.");
  if (!c.env.SHOTS) return message(c, 501, "File storage isn't available right now.");
  await c.env.SHOTS.delete(fileKey(project.id, file.id));
  await c.env.DB.prepare("DELETE FROM project_file WHERE id = ?").bind(file.id).run();
  await c.env.DB.prepare("UPDATE project SET updated = ? WHERE id = ?")
    .bind(now(), project.id)
    .run();
  return c.json({ removed: true });
});

routes.post("/:project/work", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  const input = await c.req.json<{ work?: unknown }>().catch(() => null);
  const workId = titleOf(input?.work, 16);
  const work = await c.env.DB.prepare("SELECT id, account_id, team_id FROM work WHERE id = ?")
    .bind(workId)
    .first<{ id: string; account_id: string; team_id: string }>();
  if (
    !work ||
    (project.team_id
      ? work.team_id !== project.team_id
      : work.account_id !== c.get("account") || Boolean(work.team_id))
  )
    return message(c, 404, "That work can't be added to this project.");
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO project_work (project_id, work_id, added_by, added) VALUES (?, ?, ?, ?)",
  )
    .bind(project.id, workId, c.get("account"), now())
    .run();
  await c.env.DB.prepare("UPDATE project SET updated = ? WHERE id = ?")
    .bind(now(), project.id)
    .run();
  return c.json({ work: workId }, 201);
});

routes.delete("/:project/work/:work", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  await c.env.DB.prepare("DELETE FROM project_work WHERE project_id = ? AND work_id = ?")
    .bind(project.id, c.req.param("work"))
    .run();
  return c.json({ removed: true });
});

routes.delete("/:project", async (c) => {
  const project = await visible(c, c.req.param("project"));
  if (!project) return message(c, 404, "That project isn't available to you.");
  if (!(await writable(c, project)))
    return message(
      c,
      402,
      "This team's plan has lapsed. Its projects can still be read, but not changed.",
    );
  if (project.created_by !== c.get("account")) {
    const owner = await c.env.DB.prepare(
      "SELECT 1 FROM membership WHERE team_id = ? AND account_id = ? AND role = 'owner'",
    )
      .bind(project.team_id, c.get("account"))
      .first();
    if (!owner)
      return message(
        c,
        403,
        "Only the person who made this project or a team owner can delete it.",
      );
  }
  if (project.team_id) {
    const otherOwner = await c.env.DB.prepare(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM project WHERE id = ?
         UNION ALL SELECT f.id FROM project f JOIN subtree p ON f.parent_id = p.id
       ) SELECT 1 FROM project f JOIN subtree s ON f.id = s.id
       WHERE f.created_by <> ? LIMIT 1`,
    )
      .bind(project.id, c.get("account"))
      .first();
    if (otherOwner) {
      const owner = await c.env.DB.prepare(
        "SELECT 1 FROM membership WHERE team_id = ? AND account_id = ? AND role = 'owner'",
      )
        .bind(project.team_id, c.get("account"))
        .first();
      if (!owner)
        return message(
          c,
          403,
          "Only a team owner can delete a project holding teammates' projects.",
        );
    }
  }
  const { results } = await c.env.DB.prepare(
    `WITH RECURSIVE subtree(id) AS (
       SELECT id FROM project WHERE id = ?
       UNION ALL SELECT f.id FROM project f JOIN subtree p ON f.parent_id = p.id
     ) SELECT a.project_id, a.id FROM project_file a JOIN subtree s ON a.project_id = s.id`,
  )
    .bind(project.id)
    .all<{ project_id: string; id: string }>();
  if (results.length && !c.env.SHOTS)
    return message(c, 501, "File storage isn't available right now.");
  for (let start = 0; start < results.length; start += 500) {
    await c.env.SHOTS?.delete(
      results.slice(start, start + 500).map((a) => fileKey(a.project_id, a.id)),
    );
  }
  await c.env.DB.prepare(
    `WITH RECURSIVE subtree(id, depth) AS (
       SELECT id, 0 FROM project WHERE id = ?
       UNION ALL SELECT f.id, p.depth + 1 FROM project f JOIN subtree p ON f.parent_id = p.id
     ) DELETE FROM project WHERE id IN (SELECT id FROM subtree)`,
  )
    .bind(project.id)
    .run();
  return c.json({ removed: true });
});

export default routes;
