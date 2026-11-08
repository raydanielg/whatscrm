import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { useBrandName } from "@/hooks/use-brand-name";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Download,
  Smartphone,
  Monitor,
  Apple,
  Check,
  Zap,
  Bell,
  WifiOff,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  INSTALLED_EVENT,
  INSTALL_PROMPT_EVENT,
  detectPlatform,
  isStandalone,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa/install";
import { toast } from "sonner";

export const Route = createFileRoute("/install-app")({
  head: () => ({
    meta: [
      { title: `Install ${BRAND_NAME} — Get the App` },
      {
        name: "description",
        content: `Install ${BRAND_NAME} as a native-like app on Android, iPhone, tablet, or desktop for a faster, offline-capable experience.`,
      },
      { property: "og:title", content: `Install ${BRAND_NAME}` },
      {
        property: "og:description",
        content: `Add ${BRAND_NAME} to your home screen or desktop for a native app feel.`,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstallAppPage,
});

const BENEFITS = [
  {
    icon: Zap,
    title: "Instant launch",
    desc: "Opens from your home screen in a dedicated window — no browser UI.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    desc: "Cached pages and assets load even without an internet connection.",
  },
  {
    icon: Bell,
    title: "Push-ready",
    desc: "Enable notifications so you never miss a conversation.",
  },
  {
    icon: Shield,
    title: "Secure",
    desc: "Same enterprise-grade security as the web app, over HTTPS.",
  },
];

function InstallAppPage() {
  const brandName = useBrandName();
  const [platform, setPlatform] = useState<ReturnType<typeof detectPlatform>>("unknown");
  const [installed, setInstalled] = useState(false);
  const [promptable, setPromptable] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    setPromptable(Boolean(window.__wacrmInstallPrompt));
    const refresh = () => setPromptable(Boolean(window.__wacrmInstallPrompt));
    const onInstalled = () => {
      setInstalled(true);
      setPromptable(false);
    };
    window.addEventListener(INSTALL_PROMPT_EVENT, refresh);
    window.addEventListener(INSTALLED_EVENT, onInstalled);
    return () => {
      window.removeEventListener(INSTALL_PROMPT_EVENT, refresh);
      window.removeEventListener(INSTALLED_EVENT, onInstalled);
    };
  }, []);

  async function triggerInstall() {
    const evt = window.__wacrmInstallPrompt as BeforeInstallPromptEvent | null | undefined;
    if (!evt) {
      toast.info("Use your browser's Install / Add to Home Screen option to install.");
      return;
    }
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === "accepted") {
        toast.success(`Installing ${brandName}`);
      } else {
        toast("Install cancelled");
      }
      window.__wacrmInstallPrompt = null;
      setPromptable(false);
    } catch (e) {
      toast.error((e as Error).message || "Install prompt failed");
    }
  }

  const defaultTab: "android" | "ios" | "desktop" =
    platform === "ios" ? "ios" : platform === "android" ? "android" : "desktop";

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <div className="text-center">
          <p className="text-xs uppercase text-muted-foreground">
            <Brand />
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Install the app
          </h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Get a fast, native-like <Brand /> experience on any device. Installs in one tap and
            works offline.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {installed ? (
              <Badge variant="secondary" className="gap-1 py-1.5 px-3">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Already installed
              </Badge>
            ) : (
              <Button size="lg" onClick={triggerInstall} className="gap-2" disabled={installed}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {promptable ? `Install ${brandName}` : "Show install steps"}
              </Button>
            )}
          </div>
          {!installed && !promptable && (
            <p className="mt-2 text-xs text-muted-foreground">
              One-click install isn't available in this browser — follow the steps below.
            </p>
          )}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <Card key={b.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <b.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  <CardTitle className="text-base">{b.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{b.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-10">
          <CardHeader>
            <CardTitle>Step-by-step by device</CardTitle>
            <CardDescription>Choose your device to see the install steps.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={defaultTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="android" className="gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" />
                  Android
                </TabsTrigger>
                <TabsTrigger value="ios" className="gap-1.5">
                  <Apple className="h-3.5 w-3.5" />
                  iPhone
                </TabsTrigger>
                <TabsTrigger value="desktop" className="gap-1.5">
                  <Monitor className="h-3.5 w-3.5" />
                  Desktop
                </TabsTrigger>
              </TabsList>

              <TabsContent value="android" className="mt-4">
                <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
                  <li>
                    Open <Brand /> in <strong>Chrome</strong> on your Android device.
                  </li>
                  <li>
                    Tap the <strong>⋮</strong> menu in the top-right corner.
                  </li>
                  <li>
                    Select <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
                  </li>
                  <li>
                    Confirm <strong>Install</strong>. <Brand /> will appear on your home screen.
                  </li>
                </ol>
              </TabsContent>

              <TabsContent value="ios" className="mt-4">
                <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
                  <li>
                    Open <Brand /> in <strong>Safari</strong> on your iPhone or iPad.
                  </li>
                  <li>
                    Tap the <strong>Share</strong> icon (square with an up arrow) at the bottom.
                  </li>
                  <li>
                    Scroll and tap <strong>Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong>Add</strong> in the top-right. The <Brand /> icon appears on your
                    home screen.
                  </li>
                </ol>
                <p className="mt-3 text-xs text-muted-foreground">
                  Note: iOS requires Safari. Chrome/Firefox on iOS can't install PWAs directly.
                </p>
              </TabsContent>

              <TabsContent value="desktop" className="mt-4">
                <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
                  <li>
                    Open <Brand /> in <strong>Chrome</strong>, <strong>Edge</strong>, or{" "}
                    <strong>Brave</strong>.
                  </li>
                  <li>
                    Look for the <strong>install icon</strong> (⊕ / monitor with arrow) in the
                    address bar.
                  </li>
                  <li>
                    Click it, then click <strong>Install</strong>.
                  </li>
                  <li>
                    <Brand /> opens in its own window and pins to your dock / taskbar / start menu.
                  </li>
                </ol>
                <p className="mt-3 text-xs text-muted-foreground">
                  On macOS Safari, use <strong>File → Add to Dock</strong> (Safari 17+).
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
