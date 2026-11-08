import { createFileRoute } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import { usePlatformBranding } from "@/hooks/use-platform-branding";

export const Route = createFileRoute("/maintenance")({
  // head() is not a React component — hooks must never run here.
  head: () => ({
    meta: [
      { title: "Scheduled maintenance" },
      { name: "description", content: "We are performing scheduled maintenance and will be back shortly." },
      { name: "robots", content: "noindex" },
      { httpEquiv: "refresh", content: "60" },
    ],
  }),
  component: MaintenancePage,
});

function MaintenancePage() {
  const brand = usePlatformBranding();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-warning/10 text-warning grid place-items-center">
          <Wrench className="w-7 h-7" />
        </div>
        <p className="mt-6 text-xs uppercase text-muted-foreground">{brand.platformName}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">We'll be right back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {brand.platformName} is undergoing scheduled maintenance. This page refreshes automatically every 60 seconds.
        </p>
        {brand.supportEmail && (
          <p className="mt-6 text-xs text-muted-foreground">
            Contact support: <a href={`mailto:${brand.supportEmail}`} className="underline hover:text-foreground">{brand.supportEmail}</a>
          </p>
        )}
      </div>
    </div>
  );
}
