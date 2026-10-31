/** One image for a piece of work row, chosen only from screenshots still claimed by that work. */
export function workPreview(
  documentShotIds: string[],
  shots: { id: string; name: string }[],
): { url: string; alt: string } | null {
  const fromDocument = documentShotIds
    .map((id) => shots.find((shot) => shot.id === id))
    .find((shot) => shot !== undefined);
  const shot = fromDocument ?? shots[0];
  return shot ? { url: `/v1/shots/${shot.id}`, alt: shot.name || "Image" } : null;
}
