import { queryOptions } from "@tanstack/react-query";
import { listConnectedApps } from "@/lib/oauth/oauth.functions";

/**
 * Shared by the route loader (shared chunk) and the list component (split
 * chunk), so it must live outside the route module.
 */
export const connectedAppsQueryOptions = queryOptions({
  queryKey: ["oauth", "connected-apps"],
  queryFn: () => listConnectedApps(),
});
