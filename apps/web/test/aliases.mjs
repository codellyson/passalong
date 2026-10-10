// Lets a test import code that uses the `#api/*` and `#shared/*` aliases Nuxt sets up. Node knows
// nothing of either, so this maps them onto the same files.
import { register } from "node:module";

register(
  `data:text/javascript,${encodeURIComponent(`
    const roots = {
      "#api/": ${JSON.stringify(new URL("../../api/src/", import.meta.url).href)},
      "#shared/": ${JSON.stringify(new URL("../shared/", import.meta.url).href)},
    };
    export async function resolve(specifier, context, next) {
      for (const [alias, root] of Object.entries(roots))
        if (specifier.startsWith(alias)) return next(root + specifier.slice(alias.length) + ".ts", context);
      return next(specifier, context);
    }
  `)}`,
);
