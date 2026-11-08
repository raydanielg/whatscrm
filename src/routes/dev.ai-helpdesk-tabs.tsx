import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  MessageSquareText, Gauge, BookOpen, ScrollText, UserPlus, CheckCircle2,
} from "lucide-react";

/**
 * Hidden visual-regression fixture for the AI Helpdesk Panel tabs.
 *
 * Mirrors the exact TabsList markup used inside `AiHelpdeskPanel` so
 * layout invariants (3-column mobile grid, 6-column ≥sm grid, no
 * wrapping, truncating labels, shrink-safe icons) can be exercised
 * without authenticated ticket state.
 *
 * Not linked from anywhere. Consumed by
 * `tests/e2e/ai-helpdesk-tabs-responsive.spec.ts`.
 *
 * Keep this markup in sync with `AiHelpdeskPanel.tsx`.
 */

export const Route = createFileRoute("/dev/ai-helpdesk-tabs")({
  component: AiHelpdeskTabsFixture,
  head: () => ({
    meta: [{ title: "AI Helpdesk tabs fixture" }],
  }),
});

function AiHelpdeskTabsFixture() {
  return (
    <main
      data-testid="ai-helpdesk-tabs-fixture"
      className="min-h-screen bg-background p-4 text-foreground"
    >
      <h1 className="sr-only">AI Helpdesk tabs responsive fixture</h1>
      <div className="mx-auto w-full max-w-md">
        <Tabs defaultValue="reply" data-testid="ai-helpdesk-tabs">
          <TabsList
            data-testid="ai-helpdesk-tabs-list"
            className="grid w-full grid-cols-3 sm:grid-cols-6 h-auto gap-1 p-1"
          >
            <TabsTrigger value="reply" data-testid="ai-helpdesk-tab-reply" className="min-w-0 px-2">
              <MessageSquareText className="h-3.5 w-3.5 mr-1 shrink-0" />
              <span className="truncate">Reply</span>
            </TabsTrigger>
            <TabsTrigger value="insight" data-testid="ai-helpdesk-tab-insight" className="min-w-0 px-2">
              <Gauge className="h-3.5 w-3.5 mr-1 shrink-0" />
              <span className="truncate">Insight</span>
            </TabsTrigger>
            <TabsTrigger value="knowledge" data-testid="ai-helpdesk-tab-knowledge" className="min-w-0 px-2">
              <BookOpen className="h-3.5 w-3.5 mr-1 shrink-0" />
              <span className="truncate">KB</span>
            </TabsTrigger>
            <TabsTrigger value="summary" data-testid="ai-helpdesk-tab-summary" className="min-w-0 px-2">
              <ScrollText className="h-3.5 w-3.5 mr-1 shrink-0" />
              <span className="truncate">Summary</span>
            </TabsTrigger>
            <TabsTrigger value="routing" data-testid="ai-helpdesk-tab-routing" className="min-w-0 px-2">
              <UserPlus className="h-3.5 w-3.5 mr-1 shrink-0" />
              <span className="truncate">Route</span>
            </TabsTrigger>
            <TabsTrigger value="resolve" data-testid="ai-helpdesk-tab-resolve" className="min-w-0 px-2">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1 shrink-0" />
              <span className="truncate">Resolve</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="reply" />
          <TabsContent value="insight" />
          <TabsContent value="knowledge" />
          <TabsContent value="summary" />
          <TabsContent value="routing" />
          <TabsContent value="resolve" />
        </Tabs>
      </div>
    </main>
  );
}
