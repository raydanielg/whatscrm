import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Hidden visual/computed-style regression fixture for scrollable tabs.
 *
 * Guards:
 *  - `rounded-control` (6px) invariant on TabsList + every TabsTrigger,
 *    including triggers scrolled offscreen.
 *  - Horizontal overflow behavior: list scrolls, does not wrap, and
 *    triggers keep `whitespace-nowrap`.
 *  - Active indicator (data-state=active shadow/background) stays
 *    aligned with the active trigger box across active/hover/focus/
 *    disabled states.
 *
 * Not linked from anywhere. Consumed by
 * `tests/e2e/tabs-radius-scrollable.spec.ts`.
 */

export const Route = createFileRoute("/dev/tabs-scrollable")({
  component: ScrollableTabsFixture,
});

const TRIGGERS = [
  "overview",
  "activity",
  "customers",
  "conversations",
  "campaigns",
  "automations",
  "billing",
  "integrations",
  "team",
  "audit-log",
  "api-keys",
  "webhooks",
];

function ScrollableTabsFixture() {
  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="mb-6 text-lg font-semibold">Scrollable tabs radius fixture</h1>

      {/* Constrained container forces horizontal overflow */}
      <section className="mb-8 max-w-[520px] space-y-2">
        <p className="text-xs text-muted-foreground">Scrollable Tabs</p>
        <div
          className="overflow-x-auto"
          data-testid="tabs-scroll-container"
        >
          <Tabs defaultValue="overview" data-testid="tabs-scrollable">
            <TabsList
              className="inline-flex w-max"
              data-testid="tabs-list-scrollable"
            >
              {TRIGGERS.map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  data-testid={`tabs-trigger-${t}`}
                >
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
            {TRIGGERS.map((t) => (
              <TabsContent key={t} value={t}>
                {t} panel
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </section>

      {/* Same scrollable list, but with a disabled trigger to snapshot */}
      <section className="max-w-[520px] space-y-2">
        <p className="text-xs text-muted-foreground">
          Scrollable Tabs with disabled item
        </p>
        <div
          className="overflow-x-auto"
          data-testid="tabs-scroll-container-disabled"
        >
          <Tabs defaultValue="a" data-testid="tabs-scrollable-disabled">
            <TabsList className="inline-flex w-max" data-testid="tabs-list-scrollable-disabled">
              <TabsTrigger value="a" data-testid="tabs-scroll-disabled-a">
                Enabled A
              </TabsTrigger>
              <TabsTrigger value="b" disabled data-testid="tabs-scroll-disabled-b">
                Disabled B
              </TabsTrigger>
              <TabsTrigger value="c" disabled data-testid="tabs-scroll-disabled-c">
                Disabled C
              </TabsTrigger>
              <TabsTrigger value="d" data-testid="tabs-scroll-disabled-d">
                Enabled D
              </TabsTrigger>
              <TabsTrigger value="e" data-testid="tabs-scroll-disabled-e">
                Enabled E — long label
              </TabsTrigger>
              <TabsTrigger value="f" data-testid="tabs-scroll-disabled-f">
                Enabled F — another long label
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </section>
    </main>
  );
}
