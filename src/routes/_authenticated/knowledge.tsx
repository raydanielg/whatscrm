import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeBase } from "@/components/app/knowledge/knowledge-base";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { AppTopbar } from "@/components/app/app-topbar";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Base" },
      {
        name: "description",
        content:
          "AI-powered knowledge articles, FAQs, and training documents grounding your assistant.",
      },
    ],
  }),
  staticData: {
    breadcrumb: "Knowledge Base",
  },
  component: KnowledgePage,
  errorComponent: ({ error }) => (
    <>
      <AppTopbar title="Knowledge Base" />
      <div className="p-8 text-sm text-destructive">
        Failed to load knowledge base: {(error as Error).message}
      </div>
    </>
  ),
  notFoundComponent: () => (
    <>
      <AppTopbar title="Knowledge Base" />
      <div className="p-8 text-sm text-muted-foreground">Not found.</div>
    </>
  ),
});

function KnowledgePage() {
  const ws = useCurrentWorkspace();
  if (ws.isLoading) {
    return (
      <>
        <AppTopbar title="Knowledge Base" />
        <div className="flex h-full items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </>
    );
  }
  if (!ws.data) {
    return (
      <>
        <AppTopbar title="Knowledge Base" />
        <div className="p-8 text-sm text-muted-foreground">
          Create or select a workspace to use the knowledge base.
        </div>
      </>
    );
  }
  return (
    <>
      <AppTopbar
        title="Knowledge Base"
        subtitle="Articles, FAQs, and training documents grounding the AI reply assistant."
      />
      <div className="h-full p-6 space-y-6 max-w-7xl w-full min-w-0 mx-auto">
        <KnowledgeBase workspaceId={ws.data.id} />
      </div>
    </>
  );
}
