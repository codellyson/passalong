/**
 * Copy to the clipboard and say so on the button that was pressed, then put its label back.
 * The confirmation lives on the control because a toast for "copied" is more chrome than the
 * action deserves.
 */
export function copy(text: string, el: EventTarget | null): void {
  const btn = el as HTMLElement | null;
  navigator.clipboard?.writeText(text).then(() => {
    if (!btn) return;
    const was = btn.textContent;
    btn.textContent = "copied";
    setTimeout(() => {
      btn.textContent = was;
    }, 1200);
  });
}
