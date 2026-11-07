// Cloudflare Turnstile on the sign-in screen's three forms (apps/api/src/turnstile.ts is the half
// that checks). Managed mode with `appearance: "interaction-only"`: the widget takes no room and
// asks nothing of nearly everybody, and appears only for a visitor Cloudflare wants a click from.
//
// Off unless `runtimeConfig.public.turnstileSiteKey` is set (NUXT_PUBLIC_TURNSTILE_SITE_KEY), and
// then the script is never loaded. The hub CSP names challenges.cloudflare.com in script-src and
// frame-src for this one script and its frame (shared/csp.ts).
//
// Rendered explicitly, not from a `cf-turnstile` div, for two reasons. The form stays on the page
// after a refusal, and a token is spent by its first Siteverify, so every attempt needs a reset.
// And the screen switches between three forms, each with its own `action`, which is fixed when
// the widget is rendered, so a switch renders it again.

type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** The field the API reads (TOKEN_FIELD in apps/api/src/turnstile.ts). */
export const TURNSTILE_FIELD = "cf-turnstile-response";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** How long a submit waits for the check to finish before sending without it (and being told so). */
const WAIT_MS = 10_000;

let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not start"));
    s.onerror = () => {
      loading = null; // a later mount may try again
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function useTurnstile(el: Ref<HTMLElement | null>, action: Ref<string>) {
  const siteKey = String(useRuntimeConfig().public.turnstileSiteKey || "");
  const enabled = siteKey !== "";

  let api: TurnstileApi | null = null;
  let id: string | null = null;
  let token = "";
  let waiting: Array<(t: string) => void> = [];

  const settle = (t: string) => {
    token = t;
    for (const w of waiting.splice(0)) w(t);
  };

  function render() {
    if (!api || !el.value) return;
    if (id) api.remove(id);
    token = "";
    id = api.render(el.value, {
      sitekey: siteKey,
      action: action.value,
      appearance: "interaction-only",
      size: "flexible",
      callback: (t: string) => settle(t),
      "expired-callback": () => {
        token = "";
      },
      // Whatever went wrong, a submit waiting on the check should not wait for nothing: it sends
      // without a token, and the API's refusal says to try again.
      "error-callback": () => settle(""),
    });
  }

  onMounted(() => {
    if (!enabled) return;
    load()
      .then((a) => {
        api = a;
        render();
      })
      .catch(() => settle(""));
  });

  watch(action, () => render());

  onBeforeUnmount(() => {
    if (api && id) api.remove(id);
    id = null;
    settle("");
  });

  return {
    enabled,
    /** The token for the next request: at once if the check has finished, else when it does. */
    token(): Promise<string> {
      if (!enabled || token) return Promise.resolve(token);
      return new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve(""), WAIT_MS);
        waiting.push((t) => {
          clearTimeout(timer);
          resolve(t);
        });
      });
    },
    /** After every request: the token it carried is spent, so the next attempt needs a new one. */
    reset() {
      token = "";
      if (api && id) api.reset(id);
    },
  };
}
