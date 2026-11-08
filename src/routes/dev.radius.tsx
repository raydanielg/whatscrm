import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Hidden visual/computed-style regression fixture guarding the shared
 * `rounded-control` (--radius-control / --radius-surface = 6px) contract
 * across all interactive primitives and overlay surfaces.
 *
 * Consumed by `tests/e2e/radius-consistency.spec.ts`.
 * Not linked from anywhere.
 */
export const Route = createFileRoute("/dev/radius")({
  component: RadiusFixture,
});

function RadiusFixture() {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <main className="min-h-screen bg-background p-8 text-foreground space-y-8">
      <h1 className="text-lg font-semibold">Radius consistency fixture</h1>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Button variants</p>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="button-default">Default</Button>
          <Button variant="secondary" data-testid="button-secondary">
            Secondary
          </Button>
          <Button variant="outline" data-testid="button-outline">
            Outline
          </Button>
          <Button variant="ghost" data-testid="button-ghost">
            Ghost
          </Button>
          <Button variant="destructive" data-testid="button-destructive">
            Destructive
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Form controls</p>
        <div className="grid max-w-md gap-2">
          <Input placeholder="Input" data-testid="input" />
          <Textarea placeholder="Textarea" data-testid="textarea" />
          <Select>
            <SelectTrigger data-testid="select-trigger">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">One</SelectItem>
              <SelectItem value="b">Two</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Badges</p>
        <div className="flex flex-wrap gap-2">
          <Badge data-testid="badge-default">Default</Badge>
          <Badge variant="secondary" data-testid="badge-secondary">
            Secondary
          </Badge>
          <Badge variant="outline" data-testid="badge-outline">
            Outline
          </Badge>
          <Badge variant="destructive" data-testid="badge-destructive">
            Destructive
          </Badge>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Card</p>
        <Card data-testid="card" className="max-w-md">
          <CardHeader>
            <CardTitle>Card</CardTitle>
          </CardHeader>
          <CardContent>Body</CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Alert</p>
        <Alert data-testid="alert" className="max-w-md">
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Alert description.</AlertDescription>
        </Alert>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">Overlays</p>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="dropdown-trigger">
                Dropdown
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent data-testid="dropdown-content">
              <DropdownMenuItem data-testid="dropdown-item">
                Item one
              </DropdownMenuItem>
              <DropdownMenuItem>Item two</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" data-testid="popover-trigger">
                Popover
              </Button>
            </PopoverTrigger>
            <PopoverContent data-testid="popover-content">
              Popover content
            </PopoverContent>
          </Popover>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="dialog-trigger">
                Dialog
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-content">
              <DialogHeader>
                <DialogTitle>Dialog</DialogTitle>
              </DialogHeader>
              Body
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </main>
  );
}
