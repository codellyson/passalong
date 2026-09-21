/**
 * TanStack Query for everything the hub loads.
 *
 * One client per app instance, so a server render never shares a cache between two requests. The
 * server never fetches hub data — neither credential is visible there — so there is nothing to
 * dehydrate: queries are disabled until the client has adopted its token.
 *
 * The defaults are what the hub was missing by hand: a result is fresh for 30 seconds, coming back
 * to the tab refreshes it, and a failed load is retried twice unless it was a signed-out session or
 * a refusal that would only repeat.
 *
 * `networkMode: "always"`, because the default ("online") pauses a fetch and its retries whenever
 * `navigator.onLine` is false — and embedded browsers and some webviews report false while plainly
 * online. Under that default the session check sat "paused" forever and the hub never left its
 * skeleton. The API is on this same origin, so there is nothing to wait for: try, and let a real
 * network failure surface as an error with Try again.
 */
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { shouldRetry } from "~/utils/http";

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
        networkMode: "always",
      },
      mutations: { retry: false, networkMode: "always" },
    },
  });
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });
  return { provide: { queryClient } };
});
