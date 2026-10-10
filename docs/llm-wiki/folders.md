# Folders

A folder holds the material for a project that outlives one handoff: a tutorial's brief, script,
screenshots and reference files. A guide remains the request to do one piece of work. Linking the
guide to the folder gives that request context without copying the files into its markdown or
changing the guide format. Folders can nest at multiple levels within one private or team space.
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
folder, not by a linked guide. They remain private downloads with byte-checked types and an R2
key under `folders/`; removing a guide does not remove its project material.
When a team's plan lapses, its folders remain readable but cannot be changed.

Documents are Markdown that a person can read and edit in the hub and an agent can read and edit
through either MCP server. Agents can also read folder images and small text assets directly.
The hub opens a document beside an outline of the folder — its documents, then its subfolders, on
one rail under the folder's name, the open one marked on the rail — and renders sanitized GitHub-flavored
Markdown, including tables, task lists, footnotes and GitHub's `> [!NOTE]` alerts, through the same
remark pipeline guide pages use. Markdown images appear as links so opening a
private document does not silently fetch a third-party image. Editing still uses the Markdown
source. Assets and linked guides stay in the same
workspace below the document. A folder with no documents keeps the same layout, so the page does not
change shape when its first document arrives. Opening another document starts it at its title. The
outline stacks above the document on narrow screens.
Each save sends the version that was opened; a newer save is refused,
so one editor cannot silently overwrite the other. Revision snapshots let a person bring earlier
text back into the editor and save it as a new version.

The MCP server instructions tell an agent to list existing folders before creating one, infer the
name and first document from a short request, pass a team slug only for an explicitly shared folder,
then use the returned id to add documents, assets and relevant guides. A local MCP agent uploads a
file by path; a hosted one accepts a client file input or issues a one-time folder upload link for a
file in its sandbox. The public `llms.txt` carries the same steps. The hub lists existing folders
first and then gives an example agent request instead of a creation form; its browser editor is
there for corrections.

Linked guides sit in the folder's outline beside its documents and subfolders, each badged with
its kind (task, bug, transfer) and opening its guide page. "+ New guide" offers a task, a bug
report or a handoff the agent-first way — it copies a sentence for the agent that names the folder
by title and id, so the agent publishes the guide and then links it with `link_folder_guide`.

Agents can also remove: `unlink_folder_guide` takes a guide out (the guide is untouched), and
`delete_folder_document` and `delete_folder_asset` remove one document or file for good — the two
tools marked destructive, and told to act only on a person's request. No tool deletes a whole
folder: one mistaken call would take every subfolder and file, so that stays a person's act in the
hub.

This is a project context, not another kind of guide. The guide's task, bug and transfer semantics
and its export format stay the same. Folder assets have their own storage and access rules rather
than pretending to be screenshots claimed by a guide.

## Sources

- `apps/api/migrations/0046_folders.sql`, `apps/api/migrations/0047_folder_hierarchy.sql`, `apps/api/src/folders.ts`, `apps/api/src/folder-tree.ts`
- `apps/web/app/pages/hub/folders/`, `apps/web/app/components/hub/Shell.vue`
- `apps/api/src/mcp-http.ts`, `packages/passalong/src/mcp.js`
