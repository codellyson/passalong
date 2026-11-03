/**
 * Copy to the clipboard and say so on the button that was pressed, then put its label back.
 * The confirmation lives on the control because a toast for "copied" is more chrome than the
 * action deserves.
 *
 * The swap is scoped to `[data-label]` when the button has one, because a button that also wears
 * an icon would otherwise lose it: writing `textContent` replaces every child, and reading it back
 * first returns the text alone, so the icon never comes back. A button with no `[data-label]`
 * behaves exactly as it always did.
 *
 * It never fails in silence. The clipboard API is missing outside a secure context (the hub opened
 * over plain http from another machine) and refuses in some browsers and frames, and either way the
 * button used to do nothing at all — so it falls back to the older copy command, and says "couldn't
 * copy" when that fails too. The label it puts back is the one from before the first press, so
 * pressing twice no longer leaves it saying "copied" for good.
 */
const resting = new WeakMap<
  HTMLElement,
  { text: string | null; timer: ReturnType<typeof setTimeout> }
>();

export function copy(text: string, el: EventTarget | null): void {
  const btn = el as HTMLElement | null;
  const say = (ok: boolean) => {
    if (!btn) return;
    const label = btn.querySelector<HTMLElement>("[data-label]") ?? btn;
    const before = resting.get(label);
    if (before) clearTimeout(before.timer);
    const text = before ? before.text : label.textContent;
    label.textContent = ok ? "copied" : "couldn't copy";
    resting.set(label, {
      text,
      timer: setTimeout(() => {
        label.textContent = text;
        resting.delete(label);
      }, 1200),
    });
  };
  if (!navigator.clipboard?.writeText) return say(legacyCopy(text));
  navigator.clipboard.writeText(text).then(
    () => say(true),
    () => say(legacyCopy(text)),
  );
}

/** `execCommand("copy")` from an off-screen textarea: deprecated, and still everywhere. */
function legacyCopy(text: string): boolean {
  // Selecting the textarea takes focus; it goes back to the button for whoever is on the keyboard.
  const focused = document.activeElement as HTMLElement | null;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    focused?.focus();
  }
}
