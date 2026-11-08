/**
 * Host selection for team-scheduled event types.
 * Strategies:
 *  - collective: booking blocks every host (client must call availability
 *    intersection). This resolver only returns the first host as the primary
 *    "owner" of the appointment row; the caller writes attendees separately.
 *  - round_robin: fewest bookings this week wins; ties broken by priority
 *    then by created_at.
 *  - priority: strictly lowest `priority` int wins.
 *  - random: uniform random over hosts available at the requested slot.
 *  - specific: the caller passed an explicit host_id.
 *
 * All logic is pure: takes hosts + booking counts, returns a host_id.
 * Multi-tenant safety: the caller must scope hosts by event_type_id, which
 * itself is workspace-scoped by RLS or admin-key filter.
 */

export type EventTypeHost = {
  host_id: string;
  priority: number | null;
  created_at: string;
};

export type HostLoad = {
  host_id: string;
  bookings_last_7d: number;
};

export type Strategy = "collective" | "round_robin" | "priority" | "random" | "specific";

export function selectHost(params: {
  strategy: Strategy;
  hosts: EventTypeHost[];
  loads?: HostLoad[];
  eligibleHostIds?: string[];
  preferredHostId?: string;
}): string | null {
  const { strategy, hosts } = params;
  const eligible = params.eligibleHostIds
    ? hosts.filter((h) => params.eligibleHostIds!.includes(h.host_id))
    : hosts;
  if (eligible.length === 0) return null;

  if (strategy === "specific" && params.preferredHostId) {
    return eligible.find((h) => h.host_id === params.preferredHostId)?.host_id ?? null;
  }

  if (strategy === "priority") {
    return [...eligible].sort(
      (a, b) => (a.priority ?? 999) - (b.priority ?? 999),
    )[0].host_id;
  }

  if (strategy === "random") {
    return eligible[Math.floor(Math.random() * eligible.length)].host_id;
  }

  if (strategy === "collective") {
    // Primary owner = highest priority host; attendees table records the rest.
    return [...eligible].sort(
      (a, b) => (a.priority ?? 999) - (b.priority ?? 999),
    )[0].host_id;
  }

  // round_robin (default): lowest 7-day load wins.
  const loads = new Map(params.loads?.map((l) => [l.host_id, l.bookings_last_7d]) ?? []);
  return [...eligible].sort((a, b) => {
    const la = loads.get(a.host_id) ?? 0;
    const lb = loads.get(b.host_id) ?? 0;
    if (la !== lb) return la - lb;
    if ((a.priority ?? 999) !== (b.priority ?? 999)) return (a.priority ?? 999) - (b.priority ?? 999);
    return a.created_at.localeCompare(b.created_at);
  })[0].host_id;
}
