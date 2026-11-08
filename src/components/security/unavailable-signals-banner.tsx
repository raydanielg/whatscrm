import { AlertTriangle } from "lucide-react";
import type { UnavailableSignal } from "@/lib/security/signal-reader";

/**
 * Tells "nothing happened" apart from "could not be read".
 *
 * The security pages fall back to 0 when a query fails. Without this banner a
 * broken query looks exactly like a quiet, healthy system.
 */
export function UnavailableSignalsBanner({ signals }: { signals?: UnavailableSignal[] }) {
  if (!signals || signals.length === 0) return null;
  return (
    <div role="alert" className="rounded-control border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <div className="font-medium flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
        {signals.length} signal{signals.length === 1 ? "" : "s"} could not be read
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Figures that depend on these show 0 because the data was unreadable, not because nothing happened.
      </p>
      <ul className="mt-2 space-y-0.5 text-xs font-mono text-muted-foreground">
        {signals.map((s) => (
          <li key={s.source} className="break-words">
            {s.source} — {s.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
