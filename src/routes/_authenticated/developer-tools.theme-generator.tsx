import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Download, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/developer-tools/theme-generator")({
  staticData: { breadcrumb: "Theme Generator" },
  head: () => ({ meta: [{ title: `Theme Generator — ${BRAND_NAME} Developer Tools` }] }),
  component: ThemeGenerator,
});

function ThemeGenerator() {
  const [slug, setSlug] = useState("midnight");
  const [name, setName] = useState("Midnight");
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [primary, setPrimary] = useState("#075E54");
  const [accent, setAccent] = useState("#F2C94C");
  const [background, setBackground] = useState("#0B0D10");
  const [surface, setSurface] = useState("#14171B");
  const [foreground, setForeground] = useState("#E6E7EA");
  const [radius, setRadius] = useState("0.75");
  const [font, setFont] = useState("Inter");

  const themeJson = useMemo(() => JSON.stringify({
    slug, name, mode,
    tokens: { primary, accent, background, surface, foreground, radius: `${radius}rem`, font },
  }, null, 2), [slug, name, mode, primary, accent, background, surface, foreground, radius, font]);

  const themeCss = useMemo(() => `:root[data-theme="${slug}"] {
  --background: ${primary /* placeholder */ ? hexToHsl(background) : ""};
  --surface: ${hexToHsl(surface)};
  --foreground: ${hexToHsl(foreground)};
  --primary: ${hexToHsl(primary)};
  --accent: ${hexToHsl(accent)};
  --radius: ${radius}rem;
  --font-sans: "${font}", ui-sans-serif, system-ui, sans-serif;
}`, [slug, primary, accent, background, surface, foreground, radius, font]);

  function download() {
    const blob = new Blob([`// theme.json\n${themeJson}\n\n/* preview.css */\n${themeCss}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${slug}.theme.txt`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Theme downloaded");
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <Palette className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">Theme Generator</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Configure tokens, preview live, and export a <Brand /> theme package.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Tokens</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Row><Field label="Slug"><Input value={slug} onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, "-"))} /></Field>
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field></Row>
            <div>
              <Label className="text-xs">Mode</Label>
              <div className="mt-1.5 flex gap-1.5">
                {(["light", "dark"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                    className={`text-xs px-2.5 py-1 rounded-control border ${mode === m ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-muted"}`}>{m}</button>
                ))}
              </div>
            </div>
            <Row><ColorField label="Primary" value={primary} onChange={setPrimary} />
            <ColorField label="Accent" value={accent} onChange={setAccent} /></Row>
            <Row><ColorField label="Background" value={background} onChange={setBackground} />
            <ColorField label="Surface" value={surface} onChange={setSurface} /></Row>
            <Row><ColorField label="Foreground" value={foreground} onChange={setForeground} />
            <Field label="Radius (rem)"><Input value={radius} onChange={(e) => setRadius(e.target.value)} /></Field></Row>
            <Field label="Font"><Input value={font} onChange={(e) => setFont(e.target.value)} /></Field>
            <div className="flex gap-2 pt-2">
              <Button onClick={download}><Download className="w-3.5 h-3.5 mr-1.5" />Download</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Live preview</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-control border border-border p-5" style={{ background, color: foreground, borderRadius: `${radius}rem` }}>
              <div style={{ background: surface, color: foreground, borderRadius: `${radius}rem` }} className="p-4 mb-3 border" >
                <h3 className="font-semibold" style={{ color: foreground }}>Sample card</h3>
                <p className="text-sm opacity-80">This preview reflects your token choices in real time.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button style={{ background: primary, color: "#fff", borderRadius: `${radius}rem` }} className="px-3 py-1.5 text-sm">Primary action</button>
                <button style={{ background: accent, color: "#111", borderRadius: `${radius}rem` }} className="px-3 py-1.5 text-sm">Accent</button>
                <button style={{ background: "transparent", color: foreground, border: `1px solid ${foreground}33`, borderRadius: `${radius}rem` }} className="px-3 py-1.5 text-sm">Secondary</button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Preview title="theme.json" body={themeJson} />
        <Preview title="preview.css" body={themeCss} />
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 rounded border border-border" aria-label={label} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}
function Preview({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-mono">{title}</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(body); toast.success("Copied"); }}><Copy className="w-3.5 h-3.5" /></Button>
      </CardHeader>
      <CardContent><pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-80">{body}</pre></CardContent>
    </Card>
  );
}

function hexToHsl(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return "0 0% 0%";
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
