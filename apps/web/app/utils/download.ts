/**
 * Save a private file — an attachment on a reply or a customer's email. Fetched with the credential and
 * handed to the browser as a download rather than linked to: a link carries no bearer token, so a hub
 * signed in with a pasted token could not follow it, and the file is private.
 */
export async function downloadFile(
  f: { name: string; url: string },
  token: string | null,
): Promise<void> {
  const res = await fetch(f.url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("That file is no longer there.");
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
