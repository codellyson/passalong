/**
 * Picking several guides to act on at once: archive, unarchive or delete them together.
 *
 * Every row on a shelf (Open, Done) carries the box, always, and a table has a select-all in its
 * header. It used to be a mode behind a Select button, which pushed every title in when it was
 * switched on and added a bar above the list: the page moved twice for one tick. The box is there
 * from the start, so nothing moves, and the bar that acts on a selection floats over the page once
 * there is one. Rows that are not yours have the box switched off, because only a guide's author can
 * archive or delete it.
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
  /** Select or clear a whole table's worth at once: the header box. */
  function setAll(items: Picked[], yes: boolean) {
    const next = { ...picked.value };
    for (const p of items) {
      if (yes) next[p.id] = p;
      else delete next[p.id];
    }
    picked.value = next;
  }
  function stop() {
    on.value = false;
    clear();
  }
  return { on, picked, list, has, toggle, setAll, clear, stop };
}
