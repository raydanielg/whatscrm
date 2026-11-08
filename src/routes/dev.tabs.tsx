import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Hidden visual/computed-style regression fixture for tabs and
 * segmented controls. Guards the shared `rounded-control` contract on
 * Tabs, Toggle, and ToggleGroup so drift in any primitive is caught
 * at CI time.
 *
 * Not linked from anywhere. Consumed by
 * `tests/e2e/tabs-radius.spec.ts`.
 */

export const Route = createFileRoute("/dev/tabs")({
  component: TabsRadiusFixture,
});

function TabsRadiusFixture() {
  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="mb-6 text-lg font-semibold">Tabs & segmented radius fixture</h1>

      <section className="mb-8 space-y-2">
        <p className="text-xs text-muted-foreground">Tabs</p>
        <Tabs defaultValue="a" data-testid="tabs">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="a" data-testid="tabs-trigger-a">One</TabsTrigger>
            <TabsTrigger value="b" data-testid="tabs-trigger-b">Two</TabsTrigger>
            <TabsTrigger value="c" data-testid="tabs-trigger-c">Three</TabsTrigger>
          </TabsList>
          <TabsContent value="a">A</TabsContent>
          <TabsContent value="b">B</TabsContent>
          <TabsContent value="c">C</TabsContent>
        </Tabs>
      </section>

      <section className="mb-8 space-y-2">
        <p className="text-xs text-muted-foreground">Toggle</p>
        <Toggle data-testid="toggle">Toggle</Toggle>
      </section>

      <section className="mb-8 space-y-2">
        <p className="text-xs text-muted-foreground">ToggleGroup</p>
        <ToggleGroup type="single" data-testid="toggle-group">
          <ToggleGroupItem value="left" data-testid="toggle-group-item-left">
            Left
          </ToggleGroupItem>
          <ToggleGroupItem value="middle" data-testid="toggle-group-item-middle">
            Middle
          </ToggleGroupItem>
          <ToggleGroupItem value="right" data-testid="toggle-group-item-right">
            Right
          </ToggleGroupItem>
        </ToggleGroup>
      </section>

      <section className="mb-8 space-y-2">
        <p className="text-xs text-muted-foreground">Disabled Tabs</p>
        <Tabs defaultValue="a" data-testid="tabs-disabled">
          <TabsList data-testid="tabs-list-disabled">
            <TabsTrigger value="a" disabled data-testid="tabs-trigger-disabled-a">
              One
            </TabsTrigger>
            <TabsTrigger value="b" disabled data-testid="tabs-trigger-disabled-b">
              Two
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Disabled Toggle / ToggleGroup</p>
        <Toggle disabled data-testid="toggle-disabled">
          Toggle
        </Toggle>
        <ToggleGroup type="single" disabled data-testid="toggle-group-disabled">
          <ToggleGroupItem value="l" data-testid="toggle-group-disabled-left">
            Left
          </ToggleGroupItem>
          <ToggleGroupItem value="r" data-testid="toggle-group-disabled-right">
            Right
          </ToggleGroupItem>
        </ToggleGroup>
      </section>
    </main>
  );
}
