// On the JSON formatter's own host, the root is the formatter. A server rewrite cannot do this: the
// browser's address would still say `/`, and the client router would hydrate the landing page.

import type { RouterConfig } from "nuxt/schema";
import { isJsonHost } from "#api/hosts";

export default {
  routes: (routes) => {
    if (!isJsonHost(useRequestURL().host)) return routes;
    const page = routes.find((route) => route.path === "/json");
    return page ? [{ ...page, path: "/" }] : routes;
  },
} satisfies RouterConfig;
