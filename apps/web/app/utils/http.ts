/**
 * The two ways a call to `/v1/*` fails, as types a query can tell apart.
 *
 * A 401 is not an error to retry or to print: it means the session ended, and the hub shows the
 * sign-in card instead. Anything else carries the server's own sentence — the API words its
 * refusals for a person — and the status, so a query can decline to retry a 4xx that will only
 * refuse again.
 */
export class SignedOut extends Error {
  constructor() {
    super("signed out");
    this.name = "SignedOut";
  }
}

export class HttpError extends Error {
  // Declared rather than a `readonly status` parameter property: Node's type stripping, which the
  // tests run under, cannot erase that shorthand.
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Retry a failed load twice, but never a signed-out session or a refusal that will only repeat. */
export function shouldRetry(failures: number, error: unknown): boolean {
  if (error instanceof SignedOut) return false;
  if (error instanceof HttpError && error.status < 500) return false;
  return failures < 2;
}
