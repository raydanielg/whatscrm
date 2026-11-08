import { createFileRoute } from "@tanstack/react-router";
import { FeatureManager } from "@/components/admin/features/feature-manager";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/features")({
  staticData: { breadcrumb: "Plan Features" },
  head: () => ({
    meta: [{ title: "Super Admin — Plan Features" }, { name: "robots", content: "noindex" }],
  }),
  component: FeaturesPage,
});

function FeaturesPage() {
  return (
    <main className="p-6">
      <FeatureManager />
    </main>
  );
}
