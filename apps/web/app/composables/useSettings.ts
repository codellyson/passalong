// What Settings reads beyond `useHub()`: connected apps, and each owned team's groups and channels.
//
// Shared by the page (for the side nav and "Needs you") and the sections that list them, under the
// same query keys the sections already used, so each is fetched once however many places read it.
import { useQueries, useQuery } from "@tanstack/vue-query";
import type { ChannelRow, ConnectorRow, GroupRow } from "~/utils/connect-apps";

export const settingsKeys = {
  connectors: ["connectors"] as const,
  groups: (slug: string) => ["groups", slug] as const,
  channels: (slug: string) => ["channels", slug] as const,
};

/** Connected apps. `watching` polls while a connection is being set up, so its progress shows. */
export function useConnectors(watching?: Ref<boolean>) {
  const { api, signedIn } = useHub();
  return useQuery({
    queryKey: settingsKeys.connectors,
    queryFn: async () =>
      (await api<{ clients: ConnectorRow[] }>("/v1/oauth/clients"))?.clients ?? [],
    enabled: signedIn,
    refetchInterval: computed(() => (watching?.value ? 4000 : false)),
  });
}

/** Groups and channels for the teams you own. Members can't change either, so they aren't fetched. */
export function useTeamExtras() {
  const { data, api, signedIn } = useHub();
  const owned = computed(() => (data.value.me?.teams ?? []).filter((t) => t.role === "owner"));
  const groups = useQueries({
    queries: computed(() =>
      owned.value.map((t) => ({
        queryKey: settingsKeys.groups(t.slug),
        queryFn: async () =>
          (await api<{ groups: GroupRow[] }>(`/v1/teams/${t.slug}/groups`))?.groups ?? [],
        enabled: signedIn.value,
      })),
    ),
  });
  const channels = useQueries({
    queries: computed(() =>
      owned.value.map((t) => ({
        queryKey: settingsKeys.channels(t.slug),
        queryFn: async () =>
          (await api<{ channels: ChannelRow[] }>(`/v1/teams/${t.slug}/channels`))?.channels ?? [],
        enabled: signedIn.value,
      })),
    ),
  });
  return computed(() =>
    owned.value.map((t, i) => ({
      slug: t.slug,
      name: t.name || t.slug,
      groups: (groups.value[i]?.data ?? []) as GroupRow[],
      channels: (channels.value[i]?.data ?? []) as ChannelRow[],
    })),
  );
}

/** Which tab each team card has open, and which app the connect sheet shows. Settable from anywhere. */
export function useSettingsUi() {
  const teamTab = useState<Record<string, string>>("settings:team-tab", () => ({}));
  const connect = useState("settings:connect", () => ({ open: false, app: "chatgpt" }));
  return { teamTab, connect };
}
