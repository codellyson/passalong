/**
 * The work id in whatever was pasted: a bare id (`w45xjxw9`, often copied with the backticks an
 * agent's message wraps it in), a share link (`/w/<id>/<key>`), or a hub link (`/hub/w/<id>`).
 * Ids are 6 to 12 lowercase letters and digits (`ID_RE` in packages/passalong/src/work.js).
 * "" when there is none.
 */
export function workIdFrom(text: string): string {
  const said = text.trim().replace(/^[`'"]+|[`'".,;:)]+$/g, "");
  const linked = said.match(/\/w\/([a-z0-9]{6,12})(?:[/?#]|$)/i);
  const id = (linked?.[1] ?? said).toLowerCase();
  return /^[a-z0-9]{6,12}$/.test(id) ? id : "";
}
