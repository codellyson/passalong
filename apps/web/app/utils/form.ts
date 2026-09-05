/**
 * Read a named input out of a form, trimmed.
 *
 * Not `form.fieldName`. `name`, `action`, `method`, `target` and a handful of others are
 * properties of HTMLFormElement itself, so a field called any of those silently reads the form's
 * own property instead of the input — the join form's "name" field read the form's name and
 * submitted an empty string. Going through `elements` names the input every time.
 *
 * The forms here are uncontrolled on purpose. In the Preact original that was forced: any
 * `setState` re-rendered and a controlled input snapped back to whatever state said, which is how
 * a handle went missing. Reading the form into locals before touching state is still the honest
 * order, so the rule survives the port.
 */
export function field(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? "";
}
