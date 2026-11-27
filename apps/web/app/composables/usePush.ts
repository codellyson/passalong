// Web Push on this device: what the browser can do, and turning it on. Shared by Settings
// (PushSettings) and the note that asks for it on Needs you, the board and after filing (PushNote).
//
// Permission is asked only from a click on turnOn(). A prompt on page load is one people refuse by
// reflex, and a refused prompt cannot be asked again — the browser remembers.

export interface PushDevice {
  id: string;
  endpoint: string;
  label: string;
  private: boolean;
  created: string;
  last_ok: string;
}

export interface PushState {
  available: boolean;
  key: string;
  devices: PushDevice[];
}

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

export function usePush() {
  const { api, json } = useHub();

  const state = ref<PushState | null>(null);
  const endpoint = ref("");
  const supported = ref(true);
  const permission = ref<NotificationPermission>("default");
  /** An iPhone or iPad in a browser tab: iOS delivers web push only to the home-screen app. */
  const iosTab = ref(false);

  const here = computed(
    () => state.value?.devices.find((d) => d.endpoint === endpoint.value) ?? null,
  );

  async function load() {
    state.value = await api<PushState>("/v1/push");
    const reg = await navigator.serviceWorker?.getRegistration();
    endpoint.value = (await reg?.pushManager.getSubscription())?.endpoint ?? "";
  }

  /** Read what this browser can do. Asks nothing. */
  function sense() {
    supported.value =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    iosTab.value = ios && !standalone;
    if (supported.value) permission.value = Notification.permission;
  }

  /** Ask the browser, subscribe, and register this device. Only ever from a click. */
  async function turnOn() {
    if (!state.value?.key) return;
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
    await api(
      "/v1/push/subscriptions",
      json("POST", { ...sub.toJSON(), label: deviceLabel(), private: false }),
    );
    await load();
  }

  return { state, endpoint, supported, permission, iosTab, here, load, sense, turnOn };
}
