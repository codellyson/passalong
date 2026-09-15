/**
 * Upload links: a one-time URL that takes an image's bytes, for an agent that holds the image as a
 * file and has no way to put it in a tool call.
 *
 * `attach_screenshot` over HTTP relies on the client filling in a URL the server can fetch, which
 * only ChatGPT does. Claude has the image in its own sandbox. What that sandbox can do is run curl,
 * so the tool hands it somewhere to send the bytes: the image goes from the sandbox to this API
 * directly and never passes through the model.
 *
 * The link is the whole authorization for that one upload, so it is kept small: stored as a hash,
 * spent by the first upload, dead after ten minutes, and it can only ever create a screenshot the
 * account already had the right to create.
 */

export const UPLOAD_PREFIX = "pa_up_";

/** Long enough to run one command after asking for it, short enough that a leaked link is stale. */
export const UPLOAD_TTL_MS = 10 * 60_000;

/** Unspent, unexpired links one account may hold at once. A loop that mints links hits this. */
export const UPLOAD_OPEN_MAX = 20;

/** The token half of a link: `pa_up_` and 32 characters of auth.ts's alphabet. */
const TOKEN_RE = /^pa_up_[A-Za-z0-9]{32}$/;

export const isUploadToken = (token: string) => TOKEN_RE.test(token);

/**
 * Sending bytes to an upload link, which cannot be behind the credential middleware: the sandbox
 * sending them has no credential, and the link exists so that it does not need one. POST as well as
 * PUT, because `curl --data-binary` without `-X` sends POST.
 */
export const publicUpload = (method: string, path: string) =>
  (method === "PUT" || method === "POST") &&
  path.startsWith("/v1/uploads/") &&
  isUploadToken(path.slice("/v1/uploads/".length));

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

/**
 * What an image is, from its first bytes.
 *
 * curl labels `--data-binary` as a form post unless told otherwise, and an agent writing the
 * command will not always remember the header. The bytes cannot forget, so they decide and the
 * header is ignored: a link nobody has to sign in to use should not store whatever it is handed
 * under an image's name. Returns "" for anything that is not one of the four types a shot can be.
 */
export function sniffImage(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data.slice(0, 12));
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return "";
}
