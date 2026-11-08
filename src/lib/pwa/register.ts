/** Removes the retired app-shell worker while home-screen support remains. */
type UpdateHandler = (registration: ServiceWorkerRegistration) => void;

function isRetiredRootWorker(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === window.location.origin &&
      (parsed.pathname === "/sw.js" || parsed.pathname === "/service-worker.js")
    );
  } catch {
    return false;
  }
}

function isRetiredRootCache(name: string): boolean {
  return (
    /^workbox-(precache-v\d+|runtime|googleAnalytics)-/.test(name) &&
    name.endsWith(`-${window.location.origin}/`)
  );
}

async function unregisterOwned(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return isRetiredRootWorker(url) && r.scope === `${window.location.origin}/`;
        })
        .map((r) => r.unregister().catch(() => false)),
    );

    // Unregistering does not remove responses left by the retired app-shell
    // worker. Clear only its Workbox buckets so an obsolete index/chunk cannot
    // keep running after the registration itself has gone away.
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      const appShellCaches = names.filter(isRetiredRootCache);
      await Promise.allSettled(appShellCaches.map((name) => caches.delete(name)));
    }

    const controllerUrl = navigator.serviceWorker.controller?.scriptURL ?? "";
    const controlledByRetiredWorker = isRetiredRootWorker(controllerUrl);
    const reloadKey = "wacrm.retired-worker-reload";
    if (controlledByRetiredWorker && !window.sessionStorage.getItem(reloadKey)) {
      window.sessionStorage.setItem(reloadKey, "1");
      window.location.reload();
    } else if (!controlledByRetiredWorker) {
      window.sessionStorage.removeItem(reloadKey);
    }
  } catch {
    /* noop */
  }
}

export async function registerPwa(onUpdateAvailable?: UpdateHandler): Promise<void> {
  // The app-shell worker is retired. Registering the cleanup-only sw.js on
  // every visit makes it claim/navigate/unregister, then repeat after reload.
  // Keep the callback signature for existing callers; there is no new app-shell
  // worker to install or announce. Existing controlled clients reload once.
  void onUpdateAvailable;
  await unregisterOwned();
}

export function activateWaitingWorker(reg: ServiceWorkerRegistration): void {
  reg.waiting?.postMessage({ type: "SKIP_WAITING" });
}
