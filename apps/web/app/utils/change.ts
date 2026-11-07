/**
 * What a hand-in's link to its change is called on the page, so a person sees "pull request #12"
 * rather than a URL (no addresses where people read, 2026-11-07). GitHub and GitLab links say what
 * they are; any other link is "the change".
 */
export function changeLabel(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "";
  }
  const path = u.pathname.replace(/\/+$/, "");
  const pull = /\/(?:pull|-\/merge_requests)\/(\d+)(?:\/|$)/.exec(path);
  if (pull)
    return `${u.hostname.includes("gitlab") ? "merge request" : "pull request"} #${pull[1]}`;
  if (/\/(?:-\/)?commits?\/[0-9a-f]{7,}/i.test(path)) return "the commit";
  if (/\/(?:-\/)?(?:tree|compare)\//.test(path)) return "the branch";
  return "the change";
}
