/**
 * A bug report, on its way to becoming guides.
 *
 * An issue is a guide — its own id, its own share key, its own pull, its own verdict — because
 * six bugs handed to a team are six things different people take and answer for separately. The
 * report is the parent that keeps them together, and product area is how they group inside it.
 * See apps/api/migrations/0006_reports.sql.
 *
 * Everything here is about the trip out: state the form holds, and the markdown it becomes. What
 * comes back is a guide like any other, and the hub already knows how to draw one.
 */
import { AREAS, SEVERITIES } from "#api/guide";

/** Kept in step with `BUG_LEAD` in packages/passalong/src/guide.js. */
const BUG_LEAD =
  "> **Bug report.** The steps under Reproduce show the problem \u2014 they are not a fix to " +
  "apply. Fix what Problem describes, then check Verification.";

export interface Shot {
  /** Empty until the upload answers — the hub's CSP is `img-src 'self'`, so there is no local
      preview to show in the meantime. */
  id: string;
  url: string;
  name: string;
  failed?: string;
}

export interface Issue {
  /** Generated here, because the guide's URL is its id and the API takes it in the path. */
  id: string;
  title: string;
  severity: string;
  where: string;
  device: string;
  /** The editor's HTML. Converted on the way out; never stored. */
  html: string;
  expected: string;
  actual: string;
  steps: string;
  shots: Shot[];
  open: boolean;
  /** Set once the issue has been written, so a second save updates rather than duplicates. */
  saved: boolean;
}

export interface Area {
  id: string;
  area: string;
  issues: Issue[];
}

export interface Report {
  /** Empty until the first save: a report row is created when there is something to put in it. */
  id: string;
  title: string;
  environment: string;
  team: string;
  to: string;
  areas: Area[];
}

export const ENVIRONMENTS = ["production", "staging", "development"] as const;

export { AREAS, SEVERITIES };

export const areaLabel = (slug: string) =>
  AREAS.find((a) => a.slug === slug)?.label || slug || "No area yet";
export const areaCode = (slug: string) => AREAS.find((a) => a.slug === slug)?.code || "NEW";
export const severityLabel = (slug: string) =>
  SEVERITIES.find((s) => s.slug === slug)?.label || slug;

/**
 * How badly it is broken, as colour. Full class strings, because Tailwind scans source text and
 * would never find `bg-${tone}-soft`.
 *
 * One copy: this was written out three times, and three copies of a lookup is how two lists end up
 * drawing the same fact two ways.
 */
const SEVERITY_TONE: Record<string, string> = {
  s1: "bg-danger-soft text-danger",
  s2: "bg-warn-soft text-warn",
  s3: "bg-accent-soft text-accent",
  s4: "bg-surface text-muted",
};
export const severityTone = (slug: string) => SEVERITY_TONE[slug] || "bg-surface text-muted";

/** The CLI's alphabet and length, so an id filed here is indistinguishable from one filed there. */
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newId(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ID_ALPHABET[(bytes[i] as number) % ID_ALPHABET.length];
  return out;
}

export function blankIssue(): Issue {
  return {
    id: newId(),
    title: "",
    severity: "s3",
    where: "",
    device: "",
    html: "",
    expected: "",
    actual: "",
    steps: "",
    shots: [],
    open: true,
    saved: false,
  };
}

export function blankArea(area = ""): Area {
  return { id: newId(6), area, issues: [blankIssue()] };
}

export function blankReport(): Report {
  return { id: "", title: "", environment: "staging", team: "", to: "", areas: [blankArea()] };
}

export function counts(report: Report) {
  const areas = new Set<string>();
  let issues = 0;
  let shots = 0;
  for (const area of report.areas) {
    if (area.area) areas.add(area.area);
    issues += area.issues.length;
    for (const issue of area.issues) shots += issue.shots.length;
  }
  return { issues, areas: areas.size, shots };
}

/** Frontmatter values the parser would otherwise misread — the same rule as the CLI's `quote()`. */
function quote(value: string): string {
  return /[:#[\]{}"'|>&*!%@`,]|^\s|\s$|^$/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/**
 * One issue, as the guide it is about to become.
 *
 * Problem and Verification are the guide format's own and mean here exactly what they mean there:
 * what is wrong, and what the person who fixes it checks — which is what they are answering when
 * they give a verdict.
 *
 * The repro goes under `Reproduce`, never `Steps`. `Steps` is an instruction to execute — "follow
 * its Steps" is what the MCP server tells every agent that pulls a guide — and steps that produce
 * a defect are the one list that must not be run as a remedy. See BUG_SECTIONS in
 * packages/passalong/src/guide.js.
 */
export function issueMarkdown(
  report: Report,
  area: Area,
  issue: Issue,
  status: "draft" | "published",
): string {
  const front: string[] = [
    `id: ${issue.id}`,
    `title: ${quote(issue.title.trim() || "Untitled issue")}`,
    // Stated, not inferred. An agent that pulls this behaves completely differently depending on
    // the answer, and the MCP server puts it in front of the document rather than trusting
    // anyone to read frontmatter.
    "kind: bug",
    `status: ${status}`,
  ];
  // Only once there is one. A report row is created on the first save, and an issue written
  // before that — which the form never does, but a caller might — should carry no parent rather
  // than an empty one the parser has to shrug off.
  if (report.id) front.push(`report: ${report.id}`);
  if (area.area) front.push(`area: ${area.area}`);
  if (issue.severity) front.push(`severity: ${issue.severity}`);
  if (report.environment) front.push(`source_context: ${quote(report.environment)}`);
  if (report.team) front.push(`team: ${report.team}`);
  if (report.to) front.push(`to: ${report.to.replace(/^@/, "")}`);
  const tags = ["bug", report.environment, area.area].filter(Boolean);
  front.push(`tags: [${tags.map(quote).join(", ")}]`);

  const body: string[] = [];

  // The same line the CLI's `bugGuide()` writes, for the same reason: a share link is plain
  // markdown any agent can fetch, and the route serving it must not decorate the document.
  body.push(BUG_LEAD);

  body.push("## Problem");
  const described = htmlToMarkdown(issue.html);
  body.push(described || "_No description given._");
  if (issue.actual.trim()) body.push(`**What happens instead.** ${issue.actual.trim()}`);

  const where = [issue.where.trim(), issue.device.trim()].filter(Boolean);
  if (where.length) body.push(where.map((w) => `\`${w}\``).join(" · "));

  for (const shot of issue.shots) {
    if (shot.url) body.push(`![${shot.name || "screenshot"}](${shot.url})`);
  }

  body.push("## Reproduce");
  body.push(issue.steps.trim() || "_Not recorded — the description above is what there is._");

  // Only when there is something to check. An empty Verification section is worse than none: it
  // reads as "nobody knows what fixed looks like" on a page that leads with that heading.
  if (issue.expected.trim()) {
    body.push("## Verification");
    body.push(issue.expected.trim());
  }

  return `---\n${front.join("\n")}\n---\n\n${body.join("\n\n")}\n`;
}

/**
 * A screenshot, made small enough to be worth keeping.
 *
 * A retina capture of a laptop screen is several megabytes of PNG, and nothing about a bug report
 * needs that: the point is what is on the screen. Longest edge 1600, JPEG, quality stepped down
 * until it is under half a megabyte — the upload cap is 5MB, and the difference is what a tester
 * on hotel wifi feels when they attach four of them.
 */
const SHOT_EDGE = 1600;
const SHOT_TARGET = 500 * 1024;

export async function shrinkImage(file: File): Promise<Blob> {
  // Anything that is not a bitmap we can redraw — an SVG, a HEIC the browser cannot decode —
  // goes up untouched rather than being refused.
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;

  // `createImageBitmap`, not `new Image()` with an object URL. An <img> load is a document image
  // load and answers to `img-src`, which on the hub is `'self'` — so a blob: (or data:) source is
  // refused by the CSP and the decode fails with an error that looks like a corrupt file. This
  // decodes the Blob directly and never involves the policy. Where it is missing, the original
  // file goes up unshrunk, which is worse but not broken.
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be read as an image`);
  }

  const scale = Math.min(1, SHOT_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SHOT_TARGET) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  // Screenshots of a light UI are mostly white; a transparent PNG flattened onto nothing becomes
  // black, so give it a ground first.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.86, 0.72, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;
    if (blob.size <= SHOT_TARGET || quality === 0.45) return blob;
  }
  return file;
}
