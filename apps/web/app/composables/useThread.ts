// Which conversation is open in the side panel, if any. One at a time, shared by every row that can
// open one, so a row only says "open this" and the panel is drawn once, by the hub's shell.
export interface ThreadTarget {
  id: string;
  title: string;
  /** The guide's own page, for whoever wants the document and not the conversation. */
  url?: string;
  /** What the row knows of the guide's state, so the panel refreshes when it changes. */
  stamp: string;
  /** Somebody holds it, or it is yours to leave a note on: shows the box. */
  reply: boolean;
  /** Nobody holds it: what is written is a note for whoever takes it. */
  noting: boolean;
  /** The question it is waiting on you to answer. Shown at the top, and the box is focused. */
  asking?: string;
}

export function useThread() {
  const target = useState<ThreadTarget | null>("hub:thread", () => null);
  return {
    target,
    open: (t: ThreadTarget) => {
      target.value = t;
    },
    close: () => {
      target.value = null;
    },
  };
}
