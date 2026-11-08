import { useEffect, useState } from "react";
import { toast } from "sonner";
import { registerPwa, activateWaitingWorker } from "@/lib/pwa/register";

/**
 * Mounts the PWA registrar and shows a toast when an update is ready.
 * Safe in preview / dev — registrar refuses those contexts.
 */
export function PwaProvider() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      toast.success("Back online", { id: "pwa-online" });
    };
    const goOffline = () => {
      setOnline(false);
      toast.warning("You're offline. Some features may be limited.", { id: "pwa-online", duration: 4000 });
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    void registerPwa((reg) => {
      toast("A new version is available", {
        id: "pwa-update",
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: () => activateWaitingWorker(reg),
        },
      });
    });

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Non-visual — feedback goes through toasts.
  void online;
  return null;
}
