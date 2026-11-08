import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getWhiteLabel } from "@/lib/white-label/white-label.functions";
import { readActiveWorkspaceId, subscribeActiveTenant } from "@/lib/tenant/active-tenant";

type LoaderConfig = {
  is_active?: boolean | null;
  loader_style?: "spinner" | "dots" | "bar" | "logo" | "custom" | null;
  loader_url?: string | null;
};

/** A branded progress rail for client-side route transitions. */
export function RouteProgressBar() {
  const workspaceId = useSyncExternalStore(
    subscribeActiveTenant,
    readActiveWorkspaceId,
    () => null,
  );
  const routerPending = useRouterState({ select: (state) => state.status === "pending" });
  const { data } = useQuery({
    queryKey: ["white-label", workspaceId],
    queryFn: () => getWhiteLabel({ data: { workspaceId } }),
    enabled: Boolean(workspaceId),
  });
  const config = (data?.workspaceId === workspaceId ? data.config : null) as LoaderConfig | null;
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (routerPending) {
      setVisible(true);
      setProgress(12);
      const timer = window.setInterval(() => {
        setProgress((current) => Math.min(86, current + Math.max(2, (86 - current) * 0.14)));
      }, 180);
      return () => window.clearInterval(timer);
    }

    if (!visible) return;
    setProgress(100);
    const timer = window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [routerPending, visible]);

  if (!visible) return null;

  const style = config?.is_active ? (config.loader_style ?? "bar") : "bar";
  const imageUrl = config?.is_active ? config.loader_url : null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-primary/15"
      role="progressbar"
      aria-label="Loading page"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      data-loader-style={style}
    >
      <div
        className="relative h-full bg-primary shadow-[0_0_10px_hsl(var(--primary))] transition-[width] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `${progress}%` }}
      >
        <span className="absolute inset-0 animate-[route-progress-shimmer_900ms_linear_infinite] bg-gradient-to-r from-transparent via-primary-foreground/45 to-transparent motion-reduce:hidden" />
        {(style === "logo" || style === "custom") && imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full object-contain"
          />
        ) : null}
      </div>
    </div>
  );
}
