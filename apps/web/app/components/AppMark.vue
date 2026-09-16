<!--
  The marks of the apps you can connect, inline.

  Separate from AppIcon for two reasons. These are somebody else's logos, drawn filled on their own
  canvases rather than stroked on AppIcon's 16-unit grid; and they are used in one place, the
  connect picker and the connected list, where the question is "which app is this" rather than
  "which action is this".

  Inline, like every other icon here: the CSP allows images from this origin only, so a logo from a
  CDN would not render at all, and Brandfetch's terms ask for hotlinking instead of storage — so its
  links are not what these came from. The marks are the ones each vendor publishes, unmodified in
  shape, used only to name their app beside its own name. Nothing here implies they endorse this.

  `currentColor` on the monochrome marks, so a tile's own colour carries them in either theme.
  Claude keeps its brand orange, which is legible on both grounds.
-->
<script setup lang="ts">
withDefaults(defineProps<{ name: keyof typeof MARKS; size?: number }>(), { size: 18 });

/** Claude's starburst. Reused at 3/4 scale for Claude Code, with a prompt badge beside it. */
const CLAUDE =
  "m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z";

interface Mark {
  /** The vendor's own canvas, kept so the shape is not redrawn to fit ours. */
  box: string;
  fill?: { d: string; transform?: string; color?: string }[];
  stroke?: { d: string; width?: number }[];
}

const MARKS: Record<string, Mark> = {
  chatgpt: {
    box: "0 0 24 24",
    fill: [
      {
        d: "M9.20509 8.76511V6.50545C9.20509 6.31513 9.27649 6.17234 9.44293 6.0773L13.9861 3.46088C14.6046 3.10413 15.342 2.93769 16.103 2.93769C18.9573 2.93769 20.7651 5.14983 20.7651 7.50454C20.7651 7.67098 20.7651 7.86129 20.7412 8.05161L16.0316 5.2924C15.7462 5.12596 15.4607 5.12596 15.1753 5.2924L9.20509 8.76511ZM19.8135 17.5659V12.1664C19.8135 11.8333 19.6708 11.5955 19.3854 11.429L13.4152 7.95633L15.3656 6.83833C15.5321 6.74328 15.6749 6.74328 15.8413 6.83833L20.3845 9.45474C21.6928 10.216 22.5728 11.8333 22.5728 13.4031C22.5728 15.2108 21.5025 16.8758 19.8135 17.5657V17.5659ZM7.80173 12.8088L5.8513 11.6671C5.68486 11.5721 5.61346 11.4293 5.61346 11.239V6.00613C5.61346 3.46111 7.56389 1.53433 10.2042 1.53433C11.2033 1.53433 12.1307 1.86743 12.9159 2.46202L8.2301 5.17371C7.94475 5.34015 7.80195 5.57798 7.80195 5.91109V12.809L7.80173 12.8088ZM12 15.2349L9.20509 13.6651V10.3351L12 8.76534L14.7947 10.3351V13.6651L12 15.2349ZM13.7958 22.4659C12.7967 22.4659 11.8693 22.1328 11.0841 21.5382L15.7699 18.8265C16.0553 18.6601 16.198 18.4222 16.198 18.0891V11.1912L18.1723 12.3329C18.3388 12.4279 18.4102 12.5707 18.4102 12.761V17.9939C18.4102 20.5389 16.4359 22.4657 13.7958 22.4657V22.4659ZM8.15848 17.1617L3.61528 14.5452C2.30696 13.784 1.42701 12.1667 1.42701 10.5969C1.42701 8.76534 2.52115 7.12414 4.20987 6.43428V11.8574C4.20987 12.1905 4.35266 12.4284 4.63802 12.5948L10.5846 16.0436L8.63415 17.1617C8.46771 17.2567 8.32492 17.2567 8.15848 17.1617ZM7.897 21.0625C5.20919 21.0625 3.23488 19.0407 3.23488 16.5432C3.23488 16.3529 3.25875 16.1626 3.2824 15.9723L7.96817 18.6839C8.25352 18.8504 8.53911 18.8504 8.82446 18.6839L14.7947 15.2351V17.4948C14.7947 17.6851 14.7233 17.8279 14.5568 17.9229L10.0136 20.5393C9.39518 20.8961 8.6578 21.0625 7.89677 21.0625H7.897ZM13.7958 23.8929C16.6739 23.8929 19.0762 21.8474 19.6235 19.1357C22.2874 18.4459 24 15.9484 24 13.4034C24 11.7383 23.2865 10.121 22.002 8.95542C22.121 8.45588 22.1924 7.95633 22.1924 7.45702C22.1924 4.0557 19.4331 1.51045 16.2458 1.51045C15.6037 1.51045 14.9852 1.60549 14.3668 1.81968C13.2963 0.773071 11.8215 0.107086 10.2042 0.107086C7.32606 0.107086 4.92383 2.15256 4.37653 4.86425C1.7126 5.55411 0 8.05161 0 10.5966C0 12.2617 0.713506 13.879 1.99795 15.0446C1.87904 15.5441 1.80764 16.0436 1.80764 16.543C1.80764 19.9443 4.56685 22.4895 7.75421 22.4895C8.39632 22.4895 9.01478 22.3945 9.63324 22.1803C10.7035 23.2269 12.1783 23.8929 13.7958 23.8929Z",
      },
    ],
  },
  claude: { box: "0 0 100 100", fill: [{ d: CLAUDE, color: "#d97757" }] },
  /**
   * The Claude mark at 2/3, with a prompt in the corner it leaves free: it runs in a terminal.
   *
   * The strokes are heavy for a 100-unit box on purpose. These tiles draw at 15–18px, where a
   * badge at the weight the other icons use came out about two pixels and read as a smudge.
   */
  "claude-code": {
    box: "0 0 100 100",
    fill: [{ d: CLAUDE, transform: "scale(0.66)", color: "#d97757" }],
    stroke: [
      { d: "M71 73l10 10-10 10", width: 11 },
      { d: "M88 93h11", width: 11 },
    ],
  },
  cursor: {
    box: "0 0 747 851",
    fill: [
      {
        d: "M731.545 201.413L390.888 4.73778C379.949 -1.57926 366.452 -1.57926 355.513 4.73778L14.8731 201.413C5.67749 206.723 0.00012207 216.542 0.00012207 227.177V623.776C0.00012207 634.394 5.67749 644.23 14.8731 649.539L355.529 846.214C366.468 852.532 379.966 852.532 390.905 846.214L731.56 649.539C740.756 644.23 746.434 634.409 746.434 623.776V227.177C746.434 216.558 740.756 206.723 731.56 201.413H731.545ZM710.147 243.074L381.293 812.663C379.07 816.501 373.201 814.933 373.201 810.487V437.526C373.201 430.074 369.218 423.18 362.757 419.438L39.7735 232.966C35.9353 230.744 37.5026 224.874 41.9484 224.874H699.655C708.996 224.874 714.833 234.997 710.162 243.09H710.147V243.074Z",
      },
    ],
  },
  /**
   * No vendor: any other MCP app. A plug, which is what connecting one is. A touch heavier than
   * AppIcon's weight, because it sits in a tile beside filled logos and read as a hairline at 15px.
   */
  mcp: {
    box: "0 0 24 24",
    stroke: [
      { d: "M9 2.5v6M15 2.5v6", width: 2 },
      { d: "M7 8.5h10v2.5a5 5 0 0 1-10 0z", width: 2 },
      { d: "M12 16.5v5", width: 2 },
    ],
  },
  /** Your own code calling the API. Braces, the shape every example is wrapped in. */
  script: {
    box: "0 0 24 24",
    stroke: [
      {
        d: "M9 3.5H8a2 2 0 0 0-2 2v4a2.5 2.5 0 0 1-2.5 2.5A2.5 2.5 0 0 1 6 14.5v4a2 2 0 0 0 2 2h1",
      },
      {
        d: "M15 3.5h1a2 2 0 0 1 2 2v4a2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 18 14.5v4a2 2 0 0 1-2 2h-1",
      },
    ],
  },
};
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="MARKS[name]?.box"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-for="p in MARKS[name]?.fill ?? []"
      :key="p.d"
      :d="p.d"
      :fill="p.color ?? 'currentColor'"
      :transform="p.transform"
    />
    <path
      v-for="p in MARKS[name]?.stroke ?? []"
      :key="p.d"
      :d="p.d"
      stroke="currentColor"
      :stroke-width="p.width ?? 1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
