/**
 * Copy to the clipboard and say so on the button that was pressed, then put its label back.
 * The confirmation lives on the control because a toast for "copied" is more chrome than the
 * action deserves.
 *
 * The swap is scoped to `[data-label]` when the button has one, because a button that also wears
 * an icon would otherwise lose it: writing `textContent` replaces every child, and reading it back
 * first returns the text alone, so the icon never comes back. A button with no `[data-label]`
 * behaves exactly as it always did.
 */
export function copy(text: string, el: EventTarget | null): void {
  const btn = el as HTMLElement | null;
  navigator.clipboard?.writeText(text).then(() => {
    if (!btn) return;
    const label = btn.querySelector<HTMLElement>("[data-label]") ?? btn;
    const was = label.textContent;
    label.textContent = "copied";
    setTimeout(() => {
      label.textContent = was;
    }, 1200);
  });
}
