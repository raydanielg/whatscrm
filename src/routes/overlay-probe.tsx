import { createFileRoute } from "@tanstack/react-router";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "@/components/ui/menubar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

/**
 * Non-indexed probe page used by the Playwright overlay regression spec.
 * Renders every popover-style Radix overlay so the test can open each one
 * and assert its content element uses `border-border` and not `elevation-3`.
 */
export const Route = createFileRoute("/overlay-probe")({
  head: () => ({
    meta: [
      { title: "Overlay Probe" },
      { name: "description", content: "Internal test surface for overlay tokens." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OverlayProbe,
});

function OverlayProbe() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-lg font-medium">Overlay Probe</h1>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button data-testid="dropdown-trigger">Dropdown</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid="dropdown-content">
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Select>
        <SelectTrigger data-testid="select-trigger" className="w-40">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent data-testid="select-content">
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button data-testid="popover-trigger">Popover</Button>
        </PopoverTrigger>
        <PopoverContent data-testid="popover-content">Body</PopoverContent>
      </Popover>

      <HoverCard openDelay={0} closeDelay={0}>
        <HoverCardTrigger asChild>
          <Button data-testid="hovercard-trigger">Hover</Button>
        </HoverCardTrigger>
        <HoverCardContent data-testid="hovercard-content">Body</HoverCardContent>
      </HoverCard>

      <ContextMenu>
        <ContextMenuTrigger data-testid="contextmenu-trigger" className="inline-block rounded border px-3 py-2">
          Right-click
        </ContextMenuTrigger>
        <ContextMenuContent data-testid="contextmenu-content">
          <ContextMenuItem>Item</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Menubar>
        <MenubarMenu>
          <MenubarTrigger data-testid="menubar-trigger">Menu</MenubarTrigger>
          <MenubarContent data-testid="menubar-content">
            <MenubarItem>Item</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button data-testid="tooltip-trigger">Tooltip</Button>
          </TooltipTrigger>
          <TooltipContent data-testid="tooltip-content">Body</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </main>
  );
}
