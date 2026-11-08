import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_API_CONFIG_SECTION } from "@/components/app/settings/api-config-sections";

export const Route = createFileRoute("/_authenticated/api-config/")({
  beforeLoad: () => {
    throw redirect({ to: "/api-config/$section", params: { section: DEFAULT_API_CONFIG_SECTION } });
  },
});
