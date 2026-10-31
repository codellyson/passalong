<!--
  Notifications on this device: Web Push, turned on per browser.

  Asking for permission happens on the button and nowhere else. A permission prompt on page load is
  one people refuse by reflex, and a refused prompt cannot be asked again — the browser remembers.

  What reaches a device is only what needs you (PUSHED in apps/api/src/notify.ts): sent to you,
  finished, didn't work, reopened, went quiet, stuck on you. "Hide titles" is per device, because
  a lock screen is: on, the notice says only that something needs you.

  iOS delivers web push only to an app added to the home screen, so on an iPhone in a browser tab
  this says how rather than offering a button that cannot work.
-->
<script setup lang="ts">
interface Device {
  id: string;
  endpoint: string;
  label: string;
  private: boolean;
  created: string;
  last_ok: string;
}

const { api, json } = useHub();

const state = ref<{ available: boolean; key: string; devices: Device[] } | null>(null);
const endpoint = ref("");
const busy = ref("");
const problem = ref("");
const tested = ref(false);
/** Which other device is asking "remove it?". It can only be added back from that device. */
const removing = ref("");

const supported = ref(true);
const permission = ref<NotificationPermission>("default");
const iosTab = ref(false);

const here = computed(
  () => state.value?.devices.find((d) => d.endpoint === endpoint.value) ?? null,
);
const others = computed(
  () => state.value?.devices.filter((d) => d.endpoint !== endpoint.value) ?? [],
);

/** "Chrome on macOS": enough to tell your devices apart in a list, and nothing more. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const s = atob(
    b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4),
  );
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function load() {
  state.value = await api<{ available: boolean; key: string; devices: Device[] }>("/v1/push");
  const reg = await navigator.serviceWorker?.getRegistration();
  endpoint.value = (await reg?.pushManager.getSubscription())?.endpoint ?? "";
}

onMounted(async () => {
  supported.value =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  iosTab.value = ios && !standalone;
  if (supported.value) permission.value = Notification.permission;
  await load().catch((e) => (problem.value = (e as Error).message));
});

async function turnOn() {
  if (!state.value?.key) return;
  busy.value = "on";
  problem.value = "";
  try {
    permission.value = await Notification.requestPermission();
    if (permission.value !== "granted") return;
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(state.value.key),
      }));
    const body = sub.toJSON();
    await api(
      "/v1/push/subscriptions",
      json("POST", { ...body, label: deviceLabel(), private: false }),
    );
    await load();
  } catch (e) {
    problem.value = (e as Error).message || "Notifications could not be turned on here.";
  } finally {
    busy.value = "";
  }
}

async function turnOff(d: Device) {
  busy.value = `off:${d.id}`;
  try {
    if (d.endpoint === endpoint.value) {
      const reg = await navigator.serviceWorker.getRegistration();
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
    }
    await api(`/v1/push/subscriptions/${d.id}`, { method: "DELETE" });
    await load();
  } catch (e) {
    problem.value = (e as Error).message;
  } finally {
    busy.value = "";
  }
}

async function setPrivate(d: Device, value: boolean) {
  await api(`/v1/push/subscriptions/${d.id}`, json("PATCH", { private: value }));
  await load();
}

async function test(d: Device) {
  busy.value = `test:${d.id}`;
  tested.value = false;
  problem.value = "";
  try {
    await api(`/v1/push/subscriptions/${d.id}/test`, json("POST"));
    tested.value = true;
  } catch (e) {
    // The server says what the push service answered; that is the one clue worth showing.
    problem.value = (e as Error).message;
    await load().catch(() => {});
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <div class="flex flex-col">
    <HubSettingRow label="This device" :hint="here ? here.label : 'Only what needs you: sent to you, finished, didn\'t work, reopened, gone quiet, stuck on you.'">
      <p v-if="!supported" class="m-0 text-muted">This browser can't show notifications from websites.</p>
      <p v-else-if="state && !state.available" class="m-0 text-muted">
        Notifications aren't set up on this server yet.
      </p>
      <p v-else-if="iosTab" class="m-0 text-muted">
        On an iPhone or iPad, notifications work once Passalong is on your home screen: tap Share, then
        <b class="font-medium text-fg">Add to Home Screen</b>, and open it from there.
      </p>
      <p v-else-if="permission === 'denied'" class="m-0 text-muted">
        This browser is set to block notifications from Passalong. Allow them in the site settings
        (the icon beside the address), then come back here.
      </p>
      <HubSkeleton v-else-if="!state && !problem" variant="lines" :rows="1" label="Loading notifications" />

      <template v-else-if="state && here">
        <p class="m-0 flex items-center gap-2 text-fg">
          <span class="size-1.5 rounded-pill bg-ok" aria-hidden="true" />
          <span class="font-medium">On</span>
        </p>
        <label class="flex items-start gap-2">
          <input type="checkbox" :checked="here.private" class="mt-1" @change="setPrivate(here, ($event.target as HTMLInputElement).checked)" />
          <span>
            Hide titles
            <span class="block text-xs text-muted">The notice says only that something needs you — for a lock screen others can see.</span>
          </span>
        </label>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn sm" type="button" :disabled="Boolean(busy)" @click="test(here)">
            {{ busy === `test:${here.id}` ? "Sending…" : "Send a test" }}
          </button>
          <button class="btn sm" type="button" :disabled="Boolean(busy)" @click="turnOff(here)">Turn off</button>
          <span v-if="tested" class="text-xs text-muted" role="status">Sent — it should appear in a few seconds.</span>
        </div>
      </template>
      <!-- Permission is asked on this button and nowhere else: a refused prompt cannot be asked again. -->
      <div v-else-if="state" class="flex flex-wrap items-center gap-3">
        <button class="btn primary sm" type="button" :disabled="Boolean(busy)" @click="turnOn">
          {{ busy === "on" ? "Turning on…" : "Turn on for this device" }}
        </button>
        <span class="text-muted">Your browser will ask first.</span>
      </div>
      <p v-if="problem" class="m-0 text-danger" role="alert">{{ problem }}</p>
    </HubSettingRow>

    <HubSettingRow v-if="others.length" label="Your other devices" hint="Each turned on from that device.">
      <ul class="m-0 list-none p-0">
        <li v-for="d in others" :key="d.id" class="border-b border-line py-2 first:pt-0 last:border-b-0">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="min-w-0 grow text-fg">
              {{ d.label || "A device" }}
              <span class="block text-xs text-muted tabular-nums">{{ d.last_ok ? `Last reached ${rel(d.last_ok)}` : `Added ${rel(d.created)}` }}{{ d.private ? " · titles hidden" : "" }}</span>
            </span>
            <button v-if="removing !== d.id" class="btn sm" type="button" :disabled="Boolean(busy)" @click="removing = d.id">Remove…</button>
          </div>
          <div v-if="removing === d.id" class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
            <p class="m-0 min-w-0 grow">Remove {{ d.label || "this device" }}? It stops getting notifications until it is turned on there again.</p>
            <button class="btn sm outline danger" type="button" :disabled="Boolean(busy)" @click="turnOff(d).then(() => (removing = ''))">Remove</button>
            <button class="btn sm" type="button" @click="removing = ''">Keep it</button>
          </div>
        </li>
      </ul>
    </HubSettingRow>
  </div>
</template>
