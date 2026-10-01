/**
 * Server-Sent Events, parsed from text as it arrives. The hub reads `/v1/events` with fetch rather
 * than EventSource because EventSource cannot send the bearer token a token sign-in uses.
 *
 * Imports nothing, so it runs under `node --test` without Nuxt.
 */
export interface SseEvent {
  event: string;
  id: string;
  data: string;
}

/** Feed it chunks; it hands back every complete event and keeps the unfinished tail. */
export function sseParser() {
  let buffer = "";
  return (chunk: string): SseEvent[] => {
    buffer += chunk.replace(/\r\n?/g, "\n");
    const out: SseEvent[] = [];
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      let id = "";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const i = line.indexOf(":");
        const field = i === -1 ? line : line.slice(0, i);
        const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "id") id = value;
        else if (field === "data") data.push(value);
      }
      if (data.length) out.push({ event, id, data: data.join("\n") });
      end = buffer.indexOf("\n\n");
    }
    return out;
  };
}
