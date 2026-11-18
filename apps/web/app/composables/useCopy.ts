/**
 * Copy text, with a state for the button to show: the clipboard first, then the legacy copy of a
 * hidden field, and failing both, `select` (if given) is selected for ⌘C / Ctrl+C.
 */
export function useCopy() {
  const state = ref<"idle" | "copied" | "manual">("idle");
  let reset: ReturnType<typeof setTimeout> | undefined;

  async function copy(text: string, select?: HTMLElement | null): Promise<boolean> {
    clearTimeout(reset);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      Object.assign(field.style, { position: "fixed", top: "0", left: "-9999px", opacity: "0" });
      document.body.appendChild(field);
      field.select();
      ok = document.execCommand("copy");
      field.remove();
      if (!ok && select) {
        const range = document.createRange();
        range.selectNodeContents(select);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    state.value = ok ? "copied" : "manual";
    reset = setTimeout(() => (state.value = "idle"), 2000);
    return ok || !!select;
  }

  onBeforeUnmount(() => clearTimeout(reset));
  return { state, copy };
}
