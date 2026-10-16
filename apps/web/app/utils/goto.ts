/**
 * The guide id in whatever was pasted: a bare id (`w45xjxw9`, often copied with the backticks an
 * agent's message wraps it in), a share link (`/g/<id>/<key>`), or a hub link (`/hub/g/<id>`).
 * Ids are 6 to 12 lowercase letters and digits (`ID_RE` in packages/passalong/src/guide.js).
 * "" when there is none.
 */
export function guideIdFrom(text: string): string {
  const said = text.trim().replace(/^[`'"]+|[`'".,;:)]+$/g, "");
  const linked = said.match(/\/g\/([a-z0-9]{6,12})(?:[/?#]|$)/i);
  const id = (linked?.[1] ?? said).toLowerCase();
  return /^[a-z0-9]{6,12}$/.test(id) ? id : "";
}
