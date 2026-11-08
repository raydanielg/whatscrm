import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
} from "@/components/ui/command";

/**
 * Extended radius fixture — guards `rounded-control` (6px) across
 * secondary/adjacent UI surfaces that aren't covered by /dev/radius:
 * tooltip, hover card, context menu, sheet, tabs, calendar day cells,
 * command palette. Consumed by
 * `tests/e2e/radius-extended.spec.ts`.
 */
export const Route = createFileRoute("/dev/radius-extended")({
  component: RadiusExtendedFixture,
});

function RadiusExtendedFixture() {
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 0, 15));

  return (
    <main className="min-h-screen bg-background p-8 text-foreground space-y-8">
      <h1 className="text-lg font-semibold">Radius extended fixture</h1>

      <TooltipProvider delayDuration={0}>
        <section className="space-y-2">
          <p className="text-xs text-muted-foreground">Tooltip</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" data-testid="tooltip-trigger">
                Tooltip
              </Button>
            </TooltipTrigger>
            <TooltipContent data-testid="tooltip-content">
              Tooltip surface
            </TooltipContent>
          </Tooltip>
        </section>
      </TooltipProvider>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Hover card</p>
        <HoverCard openDelay={0} closeDelay={0}>
          <HoverCardTrigger asChild>
            <Button variant="outline" data-testid="hovercard-trigger">
              Hover
            </Button>
          </HoverCardTrigger>
          <HoverCardContent data-testid="hovercard-content">
            Hover card surface
          </HoverCardContent>
        </HoverCard>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Context menu</p>
        <ContextMenu>
          <ContextMenuTrigger
            data-testid="contextmenu-trigger"
            className="inline-flex h-9 items-center rounded-control border px-3 text-sm"
          >
            Right click me
          </ContextMenuTrigger>
          <ContextMenuContent data-testid="contextmenu-content">
            <ContextMenuItem data-testid="contextmenu-item">
              Item one
            </ContextMenuItem>
            <ContextMenuItem>Item two</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Sheet</p>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" data-testid="sheet-trigger">
              Sheet
            </Button>
          </SheetTrigger>
          <SheetContent data-testid="sheet-content">
            <SheetHeader>
              <SheetTitle>Sheet</SheetTitle>
            </SheetHeader>
            Body
          </SheetContent>
        </Sheet>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Tabs</p>
        <Tabs defaultValue="a" className="max-w-md">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="a" data-testid="tabs-trigger">
              One
            </TabsTrigger>
            <TabsTrigger value="b">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="a" data-testid="tabs-content">
            Panel A
          </TabsContent>
          <TabsContent value="b">Panel B</TabsContent>
        </Tabs>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Calendar</p>
        <div data-testid="calendar-wrap" className="inline-block">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            defaultMonth={new Date(2026, 0, 1)}
          />
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Command palette</p>
        <Command
          data-testid="command"
          className="max-w-md border"
        >
          <CommandInput placeholder="Search" data-testid="command-input" />
          <CommandList>
            <CommandItem data-testid="command-item">Item one</CommandItem>
            <CommandItem>Item two</CommandItem>
          </CommandList>
        </Command>
      </section>
    </main>
  );
}
