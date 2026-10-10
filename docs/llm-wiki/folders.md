# Folders

A folder holds the material for a project that outlives one handoff: a tutorial's brief, script,
screenshots and reference files. A guide remains the request to do one piece of work. Linking the
guide to the folder gives that request context without copying the files into its markdown or
changing the guide format. Folders can nest at multiple levels within one private or team space.
Each folder may carry a grouping color; an uncolored child inherits its parent's color in the hub.
People can select several folders to recolor, move or delete them. Moving a parent keeps its
subtree together, and the API refuses cycles and moves across spaces.

Each folder is private to its creator or shared with one team. Team membership grants reading and
writing; only its creator or a team owner can delete the whole folder. Files are owned by the
folder, not by a linked guide. They remain private downloads with byte-checked types and an R2
key under `folders/`; removing a guide does not remove its project material.
When a team's plan lapses, its folders remain readable but cannot be changed.

Documents are Markdown that a person can read and edit in the hub and an agent can read and edit
through either MCP server. Agents can also read folder images and small text assets directly.
The hub opens a document beside a persistent document list and renders sanitized GitHub-flavored
Markdown, including tables, task lists and footnotes. Markdown images appear as links so opening a
private document does not silently fetch a third-party image. Editing still uses the Markdown
source. Assets and linked guides stay in the same
workspace below the document. The list stacks above the document on narrow screens.
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

This is a project context, not another kind of guide. The guide's task, bug and transfer semantics
and its export format stay the same. Folder assets have their own storage and access rules rather
than pretending to be screenshots claimed by a guide.

## Sources

- `apps/api/migrations/0046_folders.sql`, `apps/api/migrations/0047_folder_hierarchy.sql`, `apps/api/src/folders.ts`
- `apps/web/app/pages/hub/folders/`, `apps/web/app/components/hub/Shell.vue`
- `apps/api/src/mcp-http.ts`, `packages/passalong/src/mcp.js`
