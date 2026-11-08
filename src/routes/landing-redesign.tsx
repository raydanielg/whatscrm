import { createFileRoute } from "@tanstack/react-router";
import { LandingRedesign } from "@/components/marketing-redesign/landing-redesign";
import { platformBrandingQueryOptions } from "@/hooks/use-platform-branding";

export const Route = createFileRoute("/landing-redesign")({
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(platformBrandingQueryOptions()),
  head: ({ loaderData: brand }) => ({
    meta: [
      { title: `${brand.name} — Landing page redesign preview` },
      {
        name: "description",
        content: `A preview of the redesigned ${brand.name} marketing landing page.`,
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LandingRedesign,
});
