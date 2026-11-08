import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

/**
 * Radius fixture for grouped controls — button groups, pagination,
 * radio/checkbox groups, toggle groups. Consumed by
 * `tests/e2e/radius-groups.spec.ts`.
 *
 * Radios use `rounded-full` by design (indicator dot). Every other
 * control in this fixture must resolve to 6px.
 */
export const Route = createFileRoute("/dev/radius-groups")({
  component: RadiusGroupsFixture,
});

function RadiusGroupsFixture() {
  const [radio, setRadio] = useState("a");
  const [toggle, setToggle] = useState<string[]>(["b"]);

  return (
    <main className="min-h-screen bg-background p-8 text-foreground space-y-8">
      <h1 className="text-lg font-semibold">Radius groups fixture</h1>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Segmented button group</p>
        <div
          data-testid="button-group"
          className="inline-flex items-center gap-1"
        >
          <Button variant="outline" data-testid="btn-group-1">
            Day
          </Button>
          <Button variant="outline" data-testid="btn-group-2">
            Week
          </Button>
          <Button variant="outline" data-testid="btn-group-3">
            Month
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Toggle group</p>
        <ToggleGroup
          type="multiple"
          value={toggle}
          onValueChange={setToggle}
          data-testid="toggle-group"
        >
          <ToggleGroupItem value="a" data-testid="toggle-group-a">
            A
          </ToggleGroupItem>
          <ToggleGroupItem value="b" data-testid="toggle-group-b">
            B
          </ToggleGroupItem>
          <ToggleGroupItem value="c" data-testid="toggle-group-c">
            C
          </ToggleGroupItem>
        </ToggleGroup>
        <Toggle data-testid="toggle-single">Single toggle</Toggle>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Pagination</p>
        <Pagination>
          <PaginationContent data-testid="pagination-content">
            <PaginationItem>
              <PaginationPrevious href="#" data-testid="pagination-prev" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" data-testid="pagination-link">
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                href="#"
                isActive
                data-testid="pagination-link-active"
              >
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis data-testid="pagination-ellipsis" />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" data-testid="pagination-next" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Checkbox group</p>
        <div className="flex flex-col gap-2" data-testid="checkbox-group">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox defaultChecked data-testid="checkbox-1" />
            Option one
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox data-testid="checkbox-2" />
            Option two
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox data-testid="checkbox-3" />
            Option three
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Radio group (indicator is intentionally circular)
        </p>
        <RadioGroup value={radio} onValueChange={setRadio}>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="a" data-testid="radio-a" />
            Alpha
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="b" data-testid="radio-b" />
            Beta
          </label>
        </RadioGroup>
      </section>
    </main>
  );
}
