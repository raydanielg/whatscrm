import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/theme-preview")({
  head: () => ({
    meta: [
      { title: "Theme Preview" },
      { name: "description", content: "Visual audit of input, border, and surface tokens." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ThemePreview,
});

const TOKENS = [
  { name: "--background", cls: "bg-background text-foreground" },
  { name: "--card", cls: "bg-card text-card-foreground" },
  { name: "--popover", cls: "bg-popover text-popover-foreground" },
  { name: "--muted", cls: "bg-muted text-muted-foreground" },
  { name: "--accent", cls: "bg-accent text-accent-foreground" },
  { name: "--primary", cls: "bg-primary text-primary-foreground" },
  { name: "--secondary", cls: "bg-secondary text-secondary-foreground" },
  { name: "--sidebar", cls: "bg-sidebar text-sidebar-foreground" },
];

const BORDERS = [
  { name: "--border", cls: "border-border" },
  { name: "--border-strong", cls: "border-border-strong" },
  { name: "--input", cls: "border-input" },
  { name: "--ring", cls: "border-ring" },
  { name: "--primary", cls: "border-primary" },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function ThemePreview() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Theme Preview</h1>
        <p className="text-sm text-muted-foreground">
          Validate <code className="text-xs">--input</code>, <code className="text-xs">--border</code>, and surface tokens across the component library.
        </p>
      </div>

      <Section title="Surface tokens" description="Backgrounds paired with their foreground token.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TOKENS.map((t) => (
            <div key={t.name} className={`rounded-control border border-border p-4 text-sm ${t.cls}`}>
              <div className="font-medium">{t.name}</div>
              <div className="opacity-70">Aa — text sample</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Border tokens" description="Border swatches on card, muted, and background surfaces.">
        {(["bg-background", "bg-card", "bg-muted"] as const).map((surface) => (
          <div key={surface} className={`grid grid-cols-2 gap-3 rounded-control p-3 md:grid-cols-5 ${surface}`}>
            {BORDERS.map((b) => (
              <div key={b.name} className={`rounded-control border-2 p-3 text-xs ${b.cls}`}>
                <div className="font-mono">{b.name}</div>
                <div className="text-muted-foreground">on {surface}</div>
              </div>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Form controls" description="Every field uses border-input via shadcn primitives.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tp-name">Full name</Label>
            <Input id="tp-name" placeholder="Jane Doe" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tp-email">Email</Label>
            <Input id="tp-email" type="email" placeholder="jane@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tp-disabled">Disabled</Label>
            <Input id="tp-disabled" disabled defaultValue="Read-only value" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tp-select">Select</Label>
            <Select>
              <SelectTrigger id="tp-select"><SelectValue placeholder="Choose an option" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a">Option A</SelectItem>
                <SelectItem value="b">Option B</SelectItem>
                <SelectItem value="c">Option C</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="tp-textarea">Message</Label>
            <Textarea id="tp-textarea" placeholder="Long-form text sample" rows={4} />
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox defaultChecked /> Checkbox
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch defaultChecked /> Switch
          </label>
          <RadioGroup defaultValue="one" className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="one" /> One</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="two" /> Two</label>
          </RadioGroup>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Elevation surfaces" description="Layered cards using border + surface tokens.">
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className={`elevation-${n} rounded-control p-4 text-sm`}>
              <div className="font-medium">Elevation {n}</div>
              <div className="text-muted-foreground">Nested surface sample</div>
              <Input className="mt-3" placeholder="Nested input" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Data table" description="Verifies row dividers use border token uniformly.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">MRR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { n: "Acme Inc.", s: "active", p: "Pro", m: "$1,200" },
              { n: "Globex", s: "trial", p: "Starter", m: "$0" },
              { n: "Umbrella", s: "paused", p: "Enterprise", m: "$8,400" },
            ].map((r) => (
              <TableRow key={r.n}>
                <TableCell>{r.n}</TableCell>
                <TableCell><Badge variant="secondary">{r.s}</Badge></TableCell>
                <TableCell>{r.p}</TableCell>
                <TableCell className="text-right">{r.m}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
