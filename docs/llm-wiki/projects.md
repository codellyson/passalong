# Folders

> **Direction since 2026-10-29** ([LOOP.md §0](../LOOP.md)): folders become **projects**, one per
> product or repo, and all work lives in one (build step 4). Agents already call them projects: the
> tools are `find_projects`, `save_project`, `read_document`, `save_document`, `delete_document`,
> `add_file`, `read_file`, `delete_file` (docs/WORK.md).

**A project is a place; its documents are what to know; work is what to do.** That is the one rule
for sorting what goes in. Anything someone still has to act on — an open defect, work not yet done, a
check nobody ran — is work, because work has an owner, a state and an answer. A document has none of
those and notifies nobody: an agent that filed an incident's open defects as documents left them with
nobody on them. Overviews, decisions, and findings already resolved are documents. Both MCP servers
lead their instructions with this rule, `save_document` repeats it ("anything someone must still act
on is work (create_work)"), and `packages/passalong/test/folder-rule.test.js` holds both servers and
`llms.txt` to it. Where a project lives comes back as `space` from `find_projects` and `save_project`
("private …" or "team …"), and agents are told to report that — an agent once told a person a folder
was in the team space when it had made it private.

A project carries the repo it is built from (`repo`, migration 0067, '' for none — a marketing project
has none), set by `save_project` and the hub's Edit and setup forms through POST/PATCH `/v1/folders`,
and returned by `find_projects`; an agent writing or checking its documents reads that repo.

What an agent learns goes into a project's documents, not into a piece of work for one person: the
capture skill and the server instructions say to read the README and the page for that area, update
the page that already covers it, and add a line to its Log.

A folder holds the material for a project that outlives one piece of work: a README, a page per
area, a Log, a tutorial's brief, script, screenshots and reference files. Linking work to the folder
gives it that context without copying the files into its markdown. Folders can nest at multiple levels within one private or team space.
Each folder may carry a grouping color; an uncolored child inherits its parent's color in the hub.
The hub list shows top-level folders and opens each level with a chevron, so depth costs nothing
until somebody opens it; each level steps in once beside a thin rail rather than slanting further.
People can select several folders to recolor, move or delete them; a folder's checkbox stands in
for its icon on hover. "Move to…" offers only legal destinations and marks the one a folder is
already in. Moving a parent keeps its subtree together, and the API refuses cycles and moves across
spaces whatever a client offers: those rules live in `folder-tree.ts`, which imports no sibling so
`test/folder-tree.test.mjs` runs them against real SQLite.

Each folder is private to its creator or shared with one team. Team membership grants reading and
writing; only its creator or a team owner can delete the whole folder. Files are owned by the
folder, not by linked work. They remain private downloads with byte-checked types and an R2
key under `folders/`; removing work does not remove its project material.
When a team's plan lapses, its folders remain readable but cannot be changed.

Documents are Markdown that a person can read and edit in the hub and an agent can read and edit
through either MCP server. Agents can also read folder images and small text assets directly.
The hub opens a document beside an outline of the folder — its documents, then its subfolders, on
one rail under the folder's name, the open one marked on the rail — and renders sanitized GitHub-flavored
Markdown, including tables, task lists, footnotes and GitHub's `> [!NOTE]` alerts, through the same
remark pipeline share pages use. Markdown images appear as links so opening a
private document does not silently fetch a third-party image. Editing still uses the Markdown
source. Files and linked work stay in the same
workspace below the document. A folder with no documents keeps the same layout, so the page does not
change shape when its first document arrives. Opening another document starts it at its title. The
outline stacks above the document on narrow screens.
Each save sends the version that was opened; a newer save is refused,
so one editor cannot silently overwrite the other. Revision snapshots let a person bring earlier
text back into the editor and save it as a new version.

The MCP server instructions tell an agent to call `find_projects` before `save_project`, infer the
name and first document from a short request, pass a team slug only for an explicitly shared project,
then use the returned id with the document and file tools. `save_document` writes, renames and moves a
document (to another folder in the same space, by changing its `folder_id`, so its id and history go
with it — never a copy and a delete, and never across spaces, since that would share it), and refuses
a stale version so nobody's writing is lost. `read_document` with `history` lists and returns earlier
versions, so a bad edit can be saved back over. A local agent adds a file by path; a hosted one passes
a client file input or asks `add_file` for a one-time upload link for a file in its sandbox.
`read_file` brings an image or small text file into the agent's context. `delete_document` and
`delete_file` remove one document or file for good — marked destructive, and told to act only on a
person's request. No tool deletes a whole project: one mistaken call would take every subfolder and
file, so that stays a person's act in the hub.

In the hub a folder is a project (`/hub/projects/:id`): its linked work is the Work tab's register,
each row opening its work page, and its documents and finished work are one History
(`GET /v1/folders/:id/project`, `project.ts`). Linking is the hub's (`POST`/`DELETE
/v1/folders/:folder/guides`, "Add existing work"); agents have no tool for it, since work will live
in its project (step 4). "New work" opens the box pre-set to the project, which links what it files.
Each saved version records what saved it (`folder_document_revision.client`, migration 0063): `hub`
is a person, `mcp` and `cli@…` an agent, `api` and '' unknown — never guessed. Who has seen which
version is `folder_document_seen` (migration 0064): opening a document in the hub writes the row, a
save writes it for the saver, and a version someone else saved after it marks the document changed
for that account. A work page lists its
projects under "Tied to".

A folder can be shared the way work is: a secret link, `/f/<id>/<key>` (migration 0048,
`folder.share_key`), that anyone holding can read with no account. It opens that folder and every
folder inside it, never anything above or beside it, and never its linked work, which has
links of its own. Unlike work, a folder is not shared until someone asks — "Share link" in the
hub; agents have no tool for it — because it holds private files; "Stop sharing" clears the key so
every copy of the old link stops working, and sharing again makes a different one. The page runs no
script and is never indexed, like a share page; files are downloads, never shown inline.

## Sources

- `apps/api/migrations/0046_folders.sql`, `apps/api/migrations/0047_folder_hierarchy.sql`, `apps/api/src/folders.ts`, `apps/api/src/folder-tree.ts`
- `apps/api/migrations/0063_document_client.sql`, `apps/api/migrations/0064_document_seen.sql`, `apps/api/src/project.ts`
- `apps/web/app/pages/hub/projects/`, `apps/web/app/components/hub/ProjectDocument.vue`, `apps/web/app/components/hub/Shell.vue`
- `apps/api/src/mcp-http.ts`, `packages/passalong/src/mcp.js`
