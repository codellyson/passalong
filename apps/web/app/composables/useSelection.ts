/**
 * Picking several guides to act on at once: archive, unarchive or delete them together.
 *
 * A mode, switched on from the list, not a checkbox that lives on every row. Rows share one
 * anatomy — titles on one left edge — and a box on only the rows you can act on would push those
 * titles in and leave the rest out of line. In the mode, every row has the box; the ones that are
 * not yours have it switched off, because only a guide's author can archive or delete it.
 *
 * State is shared through useState so the rows and the bar that acts on them agree without
 * threading a prop through each list.
 */
export interface Picked {
  id: string;
  title: string;
  /** Already archived, so it is a candidate for Unarchive rather than Archive. */
  archived: boolean;
}

export function useSelection() {
  const on = useState("hub:select:on", () => false);
  const picked = useState<Record<string, Picked>>("hub:select:picked", () => ({}));

  const list = computed(() => Object.values(picked.value));
  const has = (id: string) => id in picked.value;
  function toggle(p: Picked) {
    const next = { ...picked.value };
    if (next[p.id]) delete next[p.id];
    else next[p.id] = p;
    picked.value = next;
  }
  const clear = () => {
    picked.value = {};
  };
  function stop() {
    on.value = false;
    clear();
  }
  return { on, picked, list, has, toggle, clear, stop };
}
