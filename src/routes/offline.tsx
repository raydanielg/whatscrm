import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlatformBranding } from "@/hooks/use-platform-branding";

export const Route = createFileRoute("/offline")({
  // head() is not a React component — hooks must never run here.
  head: () => ({
    meta: [
      { title: "You are offline" },
      { name: "description", content: "You're offline. Reconnect to continue where you left off." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OfflinePage,
});

function OfflinePage() {
  const brand = usePlatformBranding();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center rounded-control border border-border bg-card p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <WifiOff className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">You're offline</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {online
            ? "Your connection is back. Try reloading."
            : `We can't reach ${brand.platformName} right now. Cached pages still work — reconnect to load fresh data.`}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Status: <span className={online ? "text-emerald-600" : "text-amber-600"}>{online ? "Online" : "Offline"}</span>
        </p>
      </div>
    </div>
  );
}
