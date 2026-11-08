import { Brand, BrandWordmark, PlatformLogo } from "@/components/brand";
import { useBrandName } from "@/hooks/use-brand-name";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { BRAND_NAME } from "@/lib/branding/brand";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { docsUrl } from "@/lib/docs/links";
import { SHOW_RESOURCE_LINKS } from "@/lib/docs/visibility";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  MessagesSquare,
  Sparkles,
  Zap,
  ShieldCheck,
  BarChart3,
  Users,
  ArrowRight,
  ArrowUpRight,
  Check,
  Github,
  Server,
  Bot,
  Workflow,
  Headphones,
  CalendarClock,
  Globe2,
  Star,
  Plug,
  Database,
  KeyRound,
  Layers,
  Megaphone,
  Ticket,
  Tag,
  Inbox,
  X,
  Clock,
  TrendingUp,
  GitBranch,
  Store,
  LifeBuoy,
  Blocks,
  Play,
  MessageCircle,
  QrCode,
  Camera,
  Send,
  Mail,
  MessageSquare,
  Instagram,
  ShoppingCart,
  Building2,
  GraduationCap,
  HeartPulse,
  Plane,
  Plus,
  Minus,
  Maximize2,
  MoreHorizontal,
  Settings,
  ChevronRight,
  type LucideIcon,
  ArrowLeft,
  UserPlus,
  AtSign,
  Phone,
  Book,
  BookOpen,
  Download,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/app/theme-switcher";
import GatewayFlow from "@/components/ui/gateway-flow";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DotPattern } from "@/components/ui/dot-pattern";
import { LeadCaptureForm } from "@/components/marketing/lead-capture-form";
import {
  SiAnthropic,
  SiGooglecalendar,
  SiGooglegemini,
  SiInstagram,
  SiMessenger,
  SiPaddle,
  SiStripe,
  SiTelegram,
  SiWhatsapp,
} from "react-icons/si";
import { BsOpenai } from "react-icons/bs";
import { WhatsAppCtaButton, WhatsAppFloatingCta } from "@/components/marketing/whatsapp-cta-button";
import { ctaAttrs, trackMarketing } from "@/lib/analytics/events";
import {
  CurrentPlanBanner,
  CurrentPlanPill,
  isCurrentPlan,
} from "@/components/app/marketing/current-plan-badge";
import {
  formatPlanPrice,
  isContactSalesPlan,
  monthlyEquivalent,
  planBullets,
  useMyPlanSummary,
  usePublicPlans,
} from "@/lib/billing/public-plans";

import platformStackImg from "@/assets/marketing/platform-stack-illustration.png";
import featureAnalyticsImg from "@/assets/marketing/feature-analytics-new.png";
import featureAutomationsImg from "@/assets/marketing/feature-automations-new.png";
import featureBroadcastImg from "@/assets/marketing/feature-broadcast-new.png";
import featureHelpdeskImg from "@/assets/marketing/feature-helpdesk-new.png";
import featureAiStudioImg from "@/assets/marketing/feature-ai-studio.png";
import featureSharedInboxImg from "@/assets/marketing/feature-shared-inbox.png";
import stepperInboxImg from "@/assets/marketing/stepper-inbox.jpg";
import stepperFlowImg from "@/assets/marketing/stepper-flow.jpg";
import stepperCampaignImg from "@/assets/marketing/stepper-campaign.jpg";
import stepperBotImg from "@/assets/marketing/stepper-bot.jpg";
import stepperEcommerceImg from "@/assets/marketing/stepper-ecommerce.jpg";
import { FaqSection } from "@/components/marketing/faq-section";
import {
  LANDING_SOCIAL_DESCRIPTION,
  OG_IMAGE_URL,
  SITE_URL,
  getLandingContent,
  landingJsonLd,
} from "@/lib/marketing/landing-content";
import { platformBrandingQueryOptions } from "@/hooks/use-platform-branding";
import { useTenantCurrency } from "@/hooks/use-currency";
import { redirectSignedInFromMarketing } from "@/lib/auth/marketing-redirect";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: redirectSignedInFromMarketing,
  loader: ({ context }) => context.queryClient.ensureQueryData(platformBrandingQueryOptions()),
  head: ({ loaderData: branding }) => {
    const content = getLandingContent(branding.platformName);
    return {
      meta: [
        { title: content.title },
        { name: "description", content: content.description },
        { property: "og:title", content: content.title },
        { property: "og:description", content: LANDING_SOCIAL_DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/` },
        { property: "og:image", content: OG_IMAGE_URL },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: "Omnichannel CRM shared inbox" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: content.title },
        { name: "twitter:description", content: LANDING_SOCIAL_DESCRIPTION },
        { name: "twitter:image", content: OG_IMAGE_URL },
        { name: "twitter:image:alt", content: "Omnichannel CRM shared inbox" },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(landingJsonLd(branding.platformName)),
        },
      ],
    };
  },
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="landing-shadows min-h-dvh overflow-x-clip bg-background">
      <Nav />
      <main>
        <Hero />
        <StackReplacement />
        <ChannelStrip />
        <Features />
        <IndustryUseCases />
        <UnifiedInboxSpotlight />
        <CRMSalesSpotlight />
        <AutomationBotsSpotlight />
        <MarketingCampaignsSpotlight />
        <PlatformEcosystemSpotlight />
        <WorkspaceManagementSpotlight />
        <PlatformOverviewBento />
        <Stepper />
        <Roles />
        <Security />
        <Integrations />
        <CTA />
        <Pricing />
        <FaqSection />
        <MarketingSection />
      </main>
      <Footer />
      <WhatsAppFloatingCta message="Hi! I'm on the {site} site and would like a quick walkthrough." />
    </div>
  );
}

/* ============================================================ */
/* Nav                                                          */
/* ============================================================ */
function Nav() {
  const links = [
    { href: "#features", label: "Features" },
    { href: "#workflow", label: "Product" },
    { href: "#industries", label: "Solutions" },
    { href: "#pricing", label: "Pricing" },
    { href: "#demo", label: "Book a demo" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container-marketing grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 h-18 md:flex md:justify-between py-4">
        <Link to="/" className="flex min-w-0 items-center gap-2 cursor-pointer">
          <PlatformLogo alt="" className="size-6 shrink-0 object-contain" />
          <BrandWordmark className="brand-wordmark min-w-0 truncate text-xl" />
        </Link>
        <nav className="hidden items-center gap-5 text-base text-muted-foreground lg:flex xl:gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="link-marketing px-1"
              {...ctaAttrs(`nav-${l.href.replace("#", "")}`, "nav", "nav_click", l.label)}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:block">
            <ThemeSwitcher />
          </div>
          <Button asChild variant="outline" size="default" className="hidden sm:inline-flex">
            <Link to="/auth" {...ctaAttrs("sign-in", "nav")}>
              Sign in
            </Link>
          </Button>
          <Button asChild variant="primary" size="default">
            <Link to="/auth" search={{ mode: "sign-up" }} {...ctaAttrs("get-started", "nav")}>
              Get started
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/* ============================================================ */
/* Hero — split: promise left, live WhatsApp mockup right       */
/* ============================================================ */
function Hero() {
  return (
    <section className="landing-hero relative bg-background border-b border-border">
      {/* Soft gradient wash */}
      <div aria-hidden className="landing-hero-wash absolute inset-0" />
      {/* Animated flow-line background — only lightly dimmed behind the centered text so copy stays legible */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          maskImage: "radial-gradient(ellipse 55% 70% at 50% 45%, rgba(0,0,0,0.45) 0%, black 60%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 55% 70% at 50% 45%, rgba(0,0,0,0.45) 0%, black 60%)",
        }}
      >
        {/* CSS selects the palette before hydration; both documents use fixed
            modes so React never leaves an SSR fallback in the iframe. */}
        <div className="landing-hero-flow-light absolute inset-0">
          <GatewayFlow mode="light" opacity={0.6} className="h-full w-full" />
        </div>
        <div className="landing-hero-flow-dark absolute inset-0">
          <GatewayFlow mode="dark" opacity={0.6} className="h-full w-full" />
        </div>
      </div>
      {/* Theme-aware radial glow — strongest at center, fading outward */}
      <div aria-hidden className="landing-hero-glow absolute inset-0 pointer-events-none" />
      {/* Clipped separately from the section so the corner marks below aren't cut off too */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 top-10 w-[520px] h-[520px] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -left-40 bottom-0 w-[420px] h-[420px] rounded-full bg-accent/20 blur-3xl" />
      </div>
      <div
        className="relative container-marketing pt-28 pb-24 lg:pt-40 lg:pb-32"
        style={{
          borderLeftStyle: "dashed",
          borderRightStyle: "dashed",
          borderLeftColor: "color-mix(in oklab, var(--accent) 20%, transparent)",
          borderRightColor: "color-mix(in oklab, var(--accent) 20%, transparent)",
        }}
      >
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary inline-flex items-center gap-1.5">
            <PlatformLogo
              alt=""
              className="size-4 shrink-0 object-contain hidden sm:inline rounded-full"
            />
            WhatsApp, Messenger &amp; Instagram APIs · Self-hosted
          </span>
          <h1 className="text-marketing-title-lg mt-6">
            Every conversation.
            <br />
            <span className="relative inline-block font-black">
              {/* gradient text */}
              <span className="landing-hero-accent-text relative bg-clip-text text-transparent">
                One unified workspace.
              </span>
              {/* underline bar */}
              <span
                aria-hidden
                className="landing-hero-accent-bar absolute inset-x-0 -bottom-1.5 h-1.5 rounded-full opacity-90"
              />
            </span>
          </h1>
          <p className="text-lg text-muted-foreground font-light mx-auto mt-6 max-w-2xl">
            <Brand /> unifies WhatsApp, Messenger, Instagram, Telegram and email into one CRM
            workspace — with sales pipelines, AI chatbots, broadcast campaigns and automation, on
            infrastructure you own.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild variant="primary" size="xl" className="w-full md:w-auto">
              <Link
                to="/auth"
                search={{ mode: "sign-up" }}
                {...ctaAttrs("start-free-trial", "hero")}
              >
                Start free trial <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="w-full md:w-auto">
              <a
                href="#workflow"
                {...ctaAttrs("see-the-product", "hero")}
                className=" bg-background!"
              >
                <Play className="size-4" /> See the product
              </a>
            </Button>
          </div>
        </div>
        <div className="mt-20 flex flex-wrap items-center justify-center gap-6 lg:mt-28">
          {[
            { Icon: SiWhatsapp, name: "WhatsApp", bg: "#25D366" },
            { Icon: SiMessenger, name: "Messenger", bg: "#0084FF" },
            { Icon: SiInstagram, name: "Instagram", bg: "#E1306C" },
            { Icon: SiTelegram, name: "Telegram", bg: "#2CA5E0" },
            { Icon: MessageSquare, name: "SMS", bg: "#FF6B00" },
            { Icon: Headphones, name: "Live Chat", bg: "#00B5A3" },
            { Icon: Mail, name: "Email", bg: "#64748B" },
          ].map(({ Icon, name, bg }) => (
            <div key={name} className="flex flex-col items-center gap-2">
              <span
                className="flex size-11 items-center justify-center rounded-full "
                style={{ background: bg }}
              >
                <Icon className="size-5 text-white" />
              </span>
              <span className="text-xs font-medium text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Inbox demo — interactive mini UI for "Why WACRM" card 01    */
/* ============================================================ */
function InboxDemo() {
  const tabs = ["All", "WhatsApp", "Instagram", "Email", "Messenger"] as const;
  type Tab = (typeof tabs)[number];

  const convs = [
    {
      id: 1,
      name: "Sarah Johnson",
      init: "SJ",
      channel: "WhatsApp" as Tab,
      dot: "bg-[#25D366]",
      Icon: MessageCircle,
      msg: "Hi! I'd like to know about the premium plan 😊",
      time: "2m",
      unread: 2,
      tag: "Lead",
      tagCls: "bg-amber-500/10 text-amber-600",
    },
    {
      id: 2,
      name: "Ahmed Hassan",
      init: "AH",
      channel: "Instagram" as Tab,
      dot: "bg-pink-500",
      Icon: Camera,
      msg: "Loved your post! Can I get a quote for 50 units?",
      time: "15m",
      unread: 1,
      tag: "Support",
      tagCls: "bg-blue-500/10 text-blue-600",
    },
    {
      id: 3,
      name: "maria.garcia@example.com",
      init: "MG",
      channel: "Email" as Tab,
      dot: "bg-blue-500",
      Icon: Mail,
      msg: "Following up on order #4521 — any updates?",
      time: "1h",
      unread: 0,
      tag: null,
      tagCls: "",
    },
    {
      id: 4,
      name: "James Lee",
      init: "JL",
      channel: "Messenger" as Tab,
      dot: "bg-blue-700",
      Icon: MessageSquare,
      msg: "Is this available in blue? Need it by Friday",
      time: "3h",
      unread: 0,
      tag: null,
      tagCls: "",
    },
    {
      id: 5,
      name: "maria.garcia@example.com",
      init: "MG",
      channel: "Email" as Tab,
      dot: "bg-blue-500",
      Icon: Mail,
      msg: "Following up on order #4521 — any updates?",
      time: "1h",
      unread: 0,
      tag: null,
      tagCls: "",
    },
  ];

  const [activeTab, setActiveTab] = useState<Tab>("All");
  const filtered = activeTab === "All" ? convs : convs.filter((c) => c.channel === activeTab);

  return (
    <div className="flex h-full flex-col bg-surface text-foreground">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4">
        <div className="flex items-center gap-1.5">
          <Inbox className="size-3 text-muted-foreground" />
          <span className="text-[11px] font-semibold text-foreground">Inbox</span>
          <span className="rounded-full bg-whatsapp/10 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-whatsapp">
            12
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-[11px] text-muted-foreground">3 agents online</span>
        </div>
      </div>
      {/* Channel tabs */}
      <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border bg-muted/40 px-2.5 py-1.5">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`shrink-0 rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
              activeTab === t
                ? "bg-background text-foreground "
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {/* Conversation list */}
      <div className="flex-1 divide-y divide-border overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <MessageCircle className="size-5 opacity-30" />
            <p className="text-[11px]">No conversations in {activeTab}</p>
          </div>
        ) : (
          filtered.map((c, i) => (
            <div
              key={c.id}
              className={`flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/50 ${
                i === 0 ? "bg-whatsapp/4" : ""
              }`}
            >
              {/* Avatar + channel dot */}
              <div className="relative mt-0.5 shrink-0">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                  {c.init}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full ${c.dot}`}
                >
                  <c.Icon className="size-2 text-white" />
                </span>
              </div>
              {/* Name + preview */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-[12px] font-semibold text-foreground">
                    {c.name}
                  </span>
                  {c.tag && (
                    <span
                      className={`shrink-0 rounded px-1 py-px text-[8px] font-semibold ${c.tagCls}`}
                    >
                      {c.tag}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {c.time}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{c.msg}</p>
              </div>
              {c.unread > 0 && (
                <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-whatsapp text-[8px] font-semibold text-white">
                  {c.unread}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================================ */
/* Channel strip                                                */
/* ============================================================ */
interface ChannelDef {
  name: string;
  Icon: LucideIcon;
  bg: string;
  tooltip: {
    badge: string;
    desc: string;
    features: string[];
  };
}

const CHANNELS: ChannelDef[] = [
  {
    name: "WhatsApp Cloud API",
    Icon: MessageCircle,
    bg: "#25D366",
    tooltip: {
      badge: "Official Meta API",
      desc: "Full-scale WhatsApp via Meta's Cloud API — no phone required.",
      features: [
        "Broadcast & template messages",
        "AI automation & chatbots",
        "Green tick badge eligible",
        "Unlimited concurrent sessions",
      ],
    },
  },
  {
    name: "WhatsApp QR",
    Icon: QrCode,
    bg: "#25D366",
    tooltip: {
      badge: "QR / Personal Number",
      desc: "Connect any WhatsApp number by scanning a QR code — no Meta approval needed.",
      features: [
        "Zero approval process",
        "Personal or business number",
        "Multi-device support",
        "Instant setup in minutes",
      ],
    },
  },
  {
    name: "Instagram DM",
    Icon: Camera,
    bg: "#E1306C",
    tooltip: {
      badge: "Meta Graph API",
      desc: "Handle Instagram Direct Messages, story replies and comment-to-DM in one inbox.",
      features: [
        "Story reply auto-capture",
        "Comment-to-DM flows",
        "Reels & post DMs",
        "Requires Meta Business approval",
      ],
    },
  },
  {
    name: "Messenger",
    Icon: MessagesSquare,
    bg: "#0084FF",
    tooltip: {
      badge: "Facebook Pages",
      desc: "Manage all Facebook Page messages from a shared team inbox.",
      features: [
        "Persistent menus & quick replies",
        "24h messaging window support",
        "Multi-page management",
        "Handover protocol for bots",
      ],
    },
  },
  {
    name: "Telegram",
    Icon: Send,
    bg: "#2CA5E0",
    tooltip: {
      badge: "Telegram Bot API",
      desc: "Connect a Telegram bot to receive and send messages at scale.",
      features: [
        "Inline keyboards & commands",
        "Group & channel support",
        "File sharing up to 2 GB",
        "No message window limits",
      ],
    },
  },
  {
    name: "Live Chat",
    Icon: Headphones,
    bg: "#00B5A3",
    tooltip: {
      badge: "Real-time Widget",
      desc: "Embed a live chat bubble on any website and capture visitors instantly.",
      features: [
        "Real-time visitor presence",
        "Offline message fallback",
        "Custom brand colors & logo",
        "Pre-chat form & lead capture",
      ],
    },
  },
  {
    name: "SMS",
    Icon: MessageSquare,
    bg: "#FF6B00",
    tooltip: {
      badge: "SMS Gateway",
      desc: "Send and receive two-way SMS via Twilio or any local gateway.",
      features: [
        "Two-way SMS conversations",
        "Bulk SMS campaigns",
        "OTP & transactional SMS",
        "Supports local & toll-free numbers",
      ],
    },
  },
  {
    name: "Email",
    Icon: Mail,
    bg: "#4285F4",
    tooltip: {
      badge: "IMAP / SMTP",
      desc: "Turn your support inbox into a shared team queue with full thread history.",
      features: [
        "Full CC / BCC support",
        "Attachment handling",
        "Email-to-ticket threading",
        "Works with Gmail, Outlook & more",
      ],
    },
  },
  {
    name: "Web Widget",
    Icon: Globe2,
    bg: "#475569",
    tooltip: {
      badge: "Embeddable Widget",
      desc: "Drop a no-code chat widget on any site — connects to all your channels.",
      features: [
        "One-line embed script",
        "Multi-language support",
        "Custom branding & avatars",
        "Mobile-responsive by default",
      ],
    },
  },
];

function ChannelStrip() {
  return (
    <section className="relative border-b border-border bg-muted/50 section-marketing-strip">
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <DotPattern className="fill-foreground/20 [mask-image:radial-gradient(480px_circle_at_center,white,transparent)]" />
      </div>
      <div className="container-marketing relative">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />
        <p className="text-center text-2xl uppercase text-foreground font-semibold">
          One timeline for every conversation your customers start
        </p>
        <TooltipProvider delayDuration={120}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 max-w-3xl mx-auto">
            {CHANNELS.map(({ name, Icon, bg, tooltip }) => (
              <Tooltip key={name}>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-default items-center overflow-hidden rounded-full border border-border bg-background text-sm font-medium text-foreground/75">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center"
                      style={{ background: bg }}
                    >
                      <Icon className="size-5 stroke-2 text-white" />
                    </span>
                    <span className="px-4 py-2">{name}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={8}
                  className="w-64 rounded-control bg-background border border-border p-0 shadow-xl text-foreground"
                >
                  <div className="h-1.5 rounded-t-xl" style={{ background: bg }} />
                  <div className="p-3.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-full"
                        style={{ background: bg }}
                      >
                        <Icon className="size-3.5 stroke-2 text-white" />
                      </span>
                      <span className="font-semibold text-base text-foreground leading-tight">
                        {name}
                      </span>
                    </div>
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase text-white mb-2"
                      style={{ background: bg }}
                    >
                      {tooltip.badge}
                    </span>
                    <p className="text-[12px] text-muted-foreground leading-relaxed mb-2.5">
                      {tooltip.desc}
                    </p>
                    <ul className="space-y-1">
                      {tooltip.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-1.5 text-[11.5px] text-foreground"
                        >
                          <span
                            className="mt-[3px] size-1.5 shrink-0 rounded-full"
                            style={{ background: bg }}
                          />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Bot demo — interactive chat for "AI that knows your         */
/* business" card 02                                           */
/* ============================================================ */
function BotDemo() {
  type Msg = { id: number; from: "customer" | "bot"; text: string; context?: string };

  const allMsgs: Msg[] = [
    { id: 1, from: "customer", text: "Hi! When will my order arrive?" },
    {
      id: 2,
      from: "bot",
      text: "Hi Sarah! 👋 Order #4521 is out for delivery — expected today by 6 PM.",
      context: "Order #4521 · CRM",
    },
    { id: 3, from: "customer", text: "Can I also check my reward points?" },
    {
      id: 4,
      from: "bot",
      text: "You have 840 pts — enough for a ₹200 discount on your next order! 🎉",
      context: "CRM · Loyalty",
    },
  ];

  const [shown, setShown] = useState(1);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown >= allMsgs.length) {
      const t = setTimeout(() => {
        setShown(1);
        setTyping(false);
      }, 3000);
      return () => clearTimeout(t);
    }
    const next = allMsgs[shown];
    if (next.from === "bot") {
      setTyping(true);
      const t = setTimeout(() => {
        setTyping(false);
        setShown((s) => s + 1);
      }, 1200);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setShown((s) => s + 1), 1600);
      return () => clearTimeout(t);
    }
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [shown, typing]);

  const visible = allMsgs.slice(0, shown);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="flex size-7 items-center justify-center rounded-full bg-whatsapp/10">
          <Bot className="size-3.5 text-whatsapp" />
        </div>
        <div>
          <p className="text-[11px] font-semibold leading-none text-foreground">AI Assistant</p>
          <p className="mt-0.5 text-[11px] leading-none text-emerald-500">● Online</p>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-full bg-muted px-2 py-1">
          <Database className="size-2.5 text-whatsapp" />
          <span className="text-[11px] font-medium text-muted-foreground">CRM context</span>
        </div>
      </div>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {visible.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.from === "customer" ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[82%]">
              {m.context && (
                <p className="mb-0.5 flex items-center gap-0.5 text-[11px] font-medium text-whatsapp">
                  <Database className="size-2.5" /> {m.context}
                </p>
              )}
              <div
                className={`rounded-control px-3 py-2 text-[11px] leading-relaxed ${
                  m.from === "customer"
                    ? "rounded-tr-sm bg-whatsapp text-white"
                    : "rounded-tl-sm bg-muted text-foreground"
                }`}
              >
                {m.text}
              </div>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="rounded-control rounded-tl-sm bg-muted px-3 py-3">
              <div className="flex items-center gap-1">
                <span
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Input */}
      <div className="shrink-0 border-t border-border p-2.5">
        <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-2">
          <span className="flex-1 text-[11px] text-muted-foreground/60">Reply...</span>
          <Send className="size-3 text-muted-foreground/60" />
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Campaign demo — animated stats for "Campaigns" card 03      */
/* ============================================================ */
function CampaignDemo() {
  const stats = [
    { label: "Sent", value: 1240, pct: 100, color: "bg-blue-400" },
    { label: "Delivered", value: 1198, pct: 97, color: "bg-indigo-400" },
    { label: "Read", value: 891, pct: 72, color: "bg-whatsapp" },
    { label: "Replied", value: 143, pct: 12, color: "bg-amber-400" },
  ];

  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 bg-background p-4">
      {/* Campaign header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-semibold text-foreground">Diwali Sale 2024 🪔</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users className="size-3" /> Premium customers · 1,240 contacts
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600">
          Completed
        </span>
      </div>

      {/* Animated stats */}
      <div className="space-y-3">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-foreground">
                  {s.value.toLocaleString()}
                </span>
                <span className="text-[11px] text-muted-foreground/60">{s.pct}%</span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${s.color}`}
                style={{ width: animate ? `${s.pct}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Template preview */}
      <div className="mt-auto rounded-control border border-border bg-muted/50 p-3">
        <p className="mb-1.5 text-[8px] font-semibold uppercase text-muted-foreground">Template</p>
        <div className="rounded-control bg-background px-2.5 py-2">
          <p className="text-[11px] leading-relaxed text-foreground">
            🪔 Hi <span className="font-medium text-whatsapp">{"{{name}}"}</span>! Our biggest sale
            is live — up to 40% off. Shop now 👇
          </p>
        </div>
        <div className="mt-2 flex gap-1">
          <button className="flex-1 rounded-control border border-border bg-background py-1 text-[11px] font-medium text-foreground">
            Shop Now
          </button>
          <button className="flex-1 rounded-control border border-border bg-background py-1 text-[11px] font-medium text-foreground">
            Unsubscribe
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Stack replacement — before / after                           */
/* ============================================================ */
function StackReplacement() {
  const channelCards = [
    {
      Icon: SiWhatsapp,
      name: "WhatsApp Business",
      bg: "#25D366",
      desc: "Official WhatsApp Cloud API. Send templates, broadcasts and 24/7 automated replies.",
    },
    {
      Icon: SiMessenger,
      name: "Facebook Messenger",
      bg: "#0084FF",
      desc: "Reply to Page messages, comments and story mentions from the same inbox.",
    },
    {
      Icon: SiInstagram,
      name: "Instagram DMs",
      bg: "#E1306C",
      desc: "Manage Instagram direct messages, comments and mentions in real time.",
    },
    {
      Icon: MessageSquare,
      name: "SMS Campaigns",
      bg: "#FF6B00",
      desc: "Reach customers instantly with high-deliverability SMS broadcasts and alerts.",
    },
    {
      Icon: Mail,
      name: "Email",
      bg: "#64748B",
      desc: "Send transactional and marketing email from the same contact timeline.",
    },
    {
      Icon: SiTelegram,
      name: "Telegram",
      bg: "#26A5E4",
      desc: "Connect a Telegram bot in seconds — no business verification, no message templates.",
    },
  ];
  const features = [
    {
      num: "01",
      title: "One inbox, every channel",
      desc: "WhatsApp, Messenger, Instagram, email and live chat — all conversations in a single workspace. No tab-switching, no missed messages, no per-agent fees.",
      link: "/helpdesk",
      linkLabel: "Open Inbox",
      image: featureSharedInboxImg,
      imageAlt: "Unified inbox showing conversations from multiple messaging channels",
    },
    {
      num: "02",
      title: "AI that knows your business",
      desc: "Bot flows with live CRM context, product catalog and order history. Handles FAQs, qualifies leads and escalates automatically — no developer required.",
      link: "/wa-chatbot",
      linkLabel: "Build AI Flows",
      image: stepperBotImg,
      imageAlt: "AI chatbot flow builder connected to CRM and product catalog",
    },
    {
      num: "03",
      title: "Campaigns that actually convert",
      desc: "Segment contacts straight from live CRM data, send approved WhatsApp templates and track delivery, opens and revenue — all in one dashboard.",
      link: "/messenger/send",
      linkLabel: "Launch Campaign",
      image: stepperCampaignImg,
      imageAlt: "WhatsApp broadcast campaign dashboard with delivery stats and segmented lists",
    },
  ];

  return (
    <section className="section-marketing bg-surface border-b border-border">
      <div className="relative container-marketing pb-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />
        {/* Header row */}
        <div className="row-bleed-marketing grid grid-cols-1 items-end gap-8 border-b border-border pb-8 lg:grid-cols-[2fr_2fr_auto] lg:gap-12">
          {/* Left — title */}
          <div>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Why <Brand />
            </span>
            <h2 className="text-marketing-title mt-4 max-w-full">
              Stop juggling four tools.
              <br /> One platform does it all.
            </h2>
          </div>
          {/* Centre — lede with left accent border */}
          <div className="border-l-2 border-whatsapp pl-5">
            <p className="text-marketing-lede">
              Most teams bolt a chatbot onto a helpdesk, export contacts into a CRM, then pay a
              fourth vendor to send campaigns. <Brand /> collapses that into one platform with one
              shared database.
            </p>
          </div>
          {/* Right — text CTA */}
          <div className="shrink-0">
            <Link
              to="/features"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground transition-colors hover:text-primary"
            >
              View all modules <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
        {/* 3-col × 2-row feature grid */}
        {/* <div className="overflow-hidden rounded-none row-bleed-marketing p-0 border-b border-border"> */}
        {/* Row 1 — text */}
        {/* <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {features.map((f) => (
              <div key={f.num} className="flex flex-col bg-muted/50 p-7 relative">
                <span className="inline-flex size-6 items-center justify-center rounded-control bg-whatsapp font-mono text-[11px] font-semibold text-white">
                  {f.num}
                </span>
                <h3 className="mt-3 text-lg font-semibold leading-snug text-foreground">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                <div className="mt-5">
                  <Link
                    to={f.link}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {f.linkLabel} <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div> */}
        {/* Row 2 — illustrations */}
        {/* <div className="grid grid-cols-1 divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {features.map((f, i) => (
              <div
                key={f.num + "-img"}
                className="aspect-square overflow-hidden bg-muted sm:aspect-4/3 lg:aspect-square"
              >
                {i === 0 ? <InboxDemo /> : i === 1 ? <BotDemo /> : <CampaignDemo />}
              </div>
            ))}
          </div> */}
        {/* </div> */}

        {/* Connection map */}
        <div className="row-bleed-marketing px-0 py-12 relative min-h-[560px] overflow-hidden border-b border-border bg-background">
          <ConnectionMap />
        </div>

        {/* Channel coverage — every messaging channel in one shared inbox */}
        <div className=" row-bleed-marketing p-0 border-b border-border last:border-b-0">
          <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {channelCards.map((c) => (
              <div
                key={c.name}
                className="group relative overflow-hidden rounded-none bg-surface p-6 transition-all duration-300 hover:bg-muted/50"
              >
                <span
                  className="flex size-12 items-center justify-center rounded-control"
                  style={{ background: `${c.bg}1A`, color: c.bg }}
                >
                  <c.Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold text-foreground">
                  {c.name}
                </h3>
                <p className="text-marketing-card-body mt-1.5">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Features — bento grid                                        */
/* ============================================================ */
function FeatureCardAutomations() {
  return (
    <div className="mt-4 overflow-hidden rounded-control border border-border bg-muted/20 px-2 py-2.5">
      <style>{`
        @keyframes wacrm-dash{to{stroke-dashoffset:-18}}
        @keyframes wacrm-glow{0%,100%{opacity:1}50%{opacity:.55}}
        @keyframes wacrm-dot{0%,100%{r:2.5;opacity:.9}50%{r:4;opacity:1}}
        .wf{animation:wacrm-dash 1s linear infinite;stroke-dasharray:5 3.5}
        .wfs{animation:wacrm-dash 1.7s linear infinite;stroke-dasharray:5 3.5}
        .wg{animation:wacrm-glow 2.4s ease-in-out infinite}
        .wd{animation:wacrm-dot 1.8s ease-in-out infinite}
      `}</style>
      <svg viewBox="0 0 256 182" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        <defs>
          <marker id="mh-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#22c55e" fillOpacity=".7" />
          </marker>
          <marker id="mh-a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#f59e0b" fillOpacity=".7" />
          </marker>
          <marker id="mh-v" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#8b5cf6" fillOpacity=".7" />
          </marker>
          <marker id="mh-b" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#3b82f6" fillOpacity=".7" />
          </marker>
          <marker id="mh-s" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#64748b" fillOpacity=".6" />
          </marker>
        </defs>

        {/* ── Connector lines ── */}
        {/* Trigger → Condition */}
        <line
          x1="128"
          y1="34"
          x2="128"
          y2="54"
          stroke="#22c55e"
          strokeWidth="1.5"
          strokeOpacity=".6"
          className="wf"
          markerEnd="url(#mh-g)"
        />
        {/* Condition → Assign Agent */}
        <path
          d="M102,84 C88,94 76,98 66,102"
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeOpacity=".6"
          fill="none"
          className="wfs"
          markerEnd="url(#mh-a)"
        />
        {/* Condition → Bot Reply */}
        <path
          d="M154,84 C168,94 180,98 190,102"
          stroke="#8b5cf6"
          strokeWidth="1.5"
          strokeOpacity=".6"
          fill="none"
          className="wfs"
          markerEnd="url(#mh-v)"
        />
        {/* Assign Agent → Notify Team */}
        <line
          x1="66"
          y1="124"
          x2="66"
          y2="143"
          stroke="#3b82f6"
          strokeWidth="1.5"
          strokeOpacity=".55"
          className="wfs"
          markerEnd="url(#mh-b)"
        />
        {/* Bot Reply → Tag Contact */}
        <line
          x1="190"
          y1="124"
          x2="190"
          y2="143"
          stroke="#64748b"
          strokeWidth="1.5"
          strokeOpacity=".45"
          className="wfs"
          markerEnd="url(#mh-s)"
        />

        {/* ── TRIGGER node ── */}
        <rect
          x="26"
          y="6"
          width="204"
          height="28"
          rx="14"
          fill="#22c55e"
          fillOpacity=".1"
          stroke="#22c55e"
          strokeOpacity=".45"
          strokeWidth="1"
          className="wg"
        />
        {/* live pulse dot */}
        <circle cx="46" cy="20" r="5.5" fill="#22c55e" fillOpacity=".18" />
        <circle cx="46" cy="20" r="2.5" fill="#22c55e" className="wd" />
        <text
          x="128"
          y="16"
          textAnchor="middle"
          fontSize="7"
          fontWeight="600"
          fill="#22c55e"
          fillOpacity=".6"
          letterSpacing=".7"
        >
          TRIGGER
        </text>
        <text x="128" y="27.5" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#22c55e">
          New WhatsApp message
        </text>

        {/* ── CONDITION node ── */}
        <rect
          x="30"
          y="54"
          width="196"
          height="30"
          rx="7"
          fill="#f59e0b"
          fillOpacity=".08"
          stroke="#f59e0b"
          strokeOpacity=".38"
          strokeWidth="1"
        />
        <text
          x="128"
          y="65"
          textAnchor="middle"
          fontSize="7"
          fontWeight="600"
          fill="#f59e0b"
          fillOpacity=".6"
          letterSpacing=".7"
        >
          CONDITION
        </text>
        <text x="128" y="78" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#f59e0b">
          Business hours?
        </text>
        {/* Yes / No branch labels */}
        <text
          x="78"
          y="97"
          textAnchor="middle"
          fontSize="8"
          fontWeight="700"
          fill="#22c55e"
          fillOpacity=".85"
        >
          Yes
        </text>
        <text
          x="178"
          y="97"
          textAnchor="middle"
          fontSize="8"
          fontWeight="700"
          fill="#8b5cf6"
          fillOpacity=".85"
        >
          No
        </text>

        {/* ── ACTION: Assign Agent ── */}
        <rect
          x="8"
          y="102"
          width="116"
          height="22"
          rx="11"
          fill="#f59e0b"
          fillOpacity=".09"
          stroke="#f59e0b"
          strokeOpacity=".35"
          strokeWidth="1"
        />
        <text x="66" y="116.5" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#f59e0b">
          Assign to agent
        </text>

        {/* ── ACTION: Bot Reply ── */}
        <rect
          x="132"
          y="102"
          width="116"
          height="22"
          rx="11"
          fill="#8b5cf6"
          fillOpacity=".1"
          stroke="#8b5cf6"
          strokeOpacity=".38"
          strokeWidth="1"
        />
        <text x="190" y="116.5" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#8b5cf6">
          Send bot reply
        </text>

        {/* ── ACTION: Notify Team ── */}
        <rect
          x="8"
          y="143"
          width="116"
          height="22"
          rx="11"
          fill="#3b82f6"
          fillOpacity=".1"
          stroke="#3b82f6"
          strokeOpacity=".38"
          strokeWidth="1"
        />
        <text x="66" y="157.5" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#3b82f6">
          Notify sales team
        </text>

        {/* ── ACTION: Tag Contact ── */}
        <rect
          x="132"
          y="143"
          width="116"
          height="22"
          rx="11"
          fill="#64748b"
          fillOpacity=".08"
          stroke="#64748b"
          strokeOpacity=".32"
          strokeWidth="1"
        />
        <text x="190" y="157.5" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#64748b">
          Tag: follow-up
        </text>
      </svg>
    </div>
  );
}

function FeatureCardBroadcast() {
  return (
    <div className="mt-4 overflow-hidden rounded-control border border-border bg-muted/20 px-2 py-2.5">
      <style>{`
        @keyframes bc-flow{to{stroke-dashoffset:-18}}
        @keyframes bc-blink{0%,100%{opacity:.9}50%{opacity:.3}}
        .bc-f{animation:bc-flow 1.1s linear infinite;stroke-dasharray:5 3.5}
        .bc-fs{animation:bc-flow 1.9s linear infinite;stroke-dasharray:5 3.5}
        .bc-bk{animation:bc-blink 2s ease-in-out infinite}
      `}</style>
      <svg viewBox="0 0 256 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        <defs>
          <marker id="bc-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#22c55e" fillOpacity=".7" />
          </marker>
          <marker id="bc-b" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#3b82f6" fillOpacity=".7" />
          </marker>
          <marker id="bc-v" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#a855f7" fillOpacity=".7" />
          </marker>
        </defs>
        {/* Campaign Trigger */}
        <rect
          x="83"
          y="4"
          width="90"
          height="30"
          rx="5"
          fill="currentColor"
          fillOpacity=".05"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth="1"
        />
        <rect x="87" y="7" width="54" height="7" rx="3" fill="#22c55e" fillOpacity=".75" />
        <circle cx="92" cy="10.5" r="2" fill="#fff" fillOpacity=".9" className="bc-bk" />
        <text x="96" y="13.5" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          Campaign Trigger
        </text>
        <text x="87" y="23" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          Audience segment
        </text>
        <text x="87" y="30" fontSize="5" fill="currentColor" fillOpacity=".65" fontWeight="600">
          2,400 contacts · Flash Sale
        </text>
        {/* Trigger → API */}
        <line
          x1="128"
          y1="34"
          x2="128"
          y2="52"
          stroke="#22c55e"
          strokeWidth="1.5"
          strokeOpacity=".6"
          className="bc-f"
          markerEnd="url(#bc-g)"
        />
        {/* WhatsApp API */}
        <rect
          x="48"
          y="52"
          width="160"
          height="30"
          rx="5"
          fill="currentColor"
          fillOpacity=".05"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth="1"
        />
        <rect x="52" y="55" width="60" height="7" rx="3" fill="#25D366" fillOpacity=".8" />
        <circle cx="57" cy="58.5" r="2" fill="#fff" fillOpacity=".9" />
        <text x="61" y="61.5" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          WhatsApp API
        </text>
        <text x="52" y="72" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          Throttled delivery · per-message read receipts
        </text>
        <text x="52" y="79" fontSize="5" fill="currentColor" fillOpacity=".65" fontWeight="600">
          SENDING 2,390 / 2,400
        </text>
        {/* API → 3 results */}
        <path
          d="M90,82 C72,93 50,97 41,101"
          stroke="#22c55e"
          strokeWidth="1.5"
          strokeOpacity=".55"
          fill="none"
          className="bc-fs"
          markerEnd="url(#bc-g)"
        />
        <line
          x1="128"
          y1="82"
          x2="128"
          y2="101"
          stroke="#3b82f6"
          strokeWidth="1.5"
          strokeOpacity=".55"
          className="bc-fs"
          markerEnd="url(#bc-b)"
        />
        <path
          d="M166,82 C184,93 206,97 215,101"
          stroke="#a855f7"
          strokeWidth="1.5"
          strokeOpacity=".55"
          fill="none"
          className="bc-fs"
          markerEnd="url(#bc-v)"
        />
        {/* Delivered */}
        <rect
          x="4"
          y="101"
          width="74"
          height="34"
          rx="5"
          fill="currentColor"
          fillOpacity=".05"
          stroke="#22c55e"
          strokeOpacity=".25"
          strokeWidth="1"
        />
        <rect x="8" y="104" width="38" height="7" rx="3" fill="#22c55e" fillOpacity=".7" />
        <text x="12" y="110" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          Delivered
        </text>
        <text x="8" y="124" fontSize="12" fill="#22c55e" fillOpacity=".95" fontWeight="800">
          98.6%
        </text>
        <text x="8" y="132" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          2,367 messages
        </text>
        {/* Opened */}
        <rect
          x="91"
          y="101"
          width="74"
          height="34"
          rx="5"
          fill="currentColor"
          fillOpacity=".05"
          stroke="#3b82f6"
          strokeOpacity=".25"
          strokeWidth="1"
        />
        <rect x="95" y="104" width="30" height="7" rx="3" fill="#3b82f6" fillOpacity=".7" />
        <text x="99" y="110" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          Opened
        </text>
        <text x="95" y="124" fontSize="12" fill="#3b82f6" fillOpacity=".95" fontWeight="800">
          42.1%
        </text>
        <text x="95" y="132" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          1,010 read
        </text>
        {/* Clicked */}
        <rect
          x="178"
          y="101"
          width="74"
          height="34"
          rx="5"
          fill="currentColor"
          fillOpacity=".05"
          stroke="#a855f7"
          strokeOpacity=".25"
          strokeWidth="1"
        />
        <rect x="182" y="104" width="28" height="7" rx="3" fill="#a855f7" fillOpacity=".7" />
        <text x="186" y="110" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          Clicked
        </text>
        <text x="182" y="124" fontSize="12" fill="#a855f7" fillOpacity=".95" fontWeight="800">
          8.3%
        </text>
        <text x="182" y="132" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          199 link taps
        </text>
      </svg>
    </div>
  );
}

function FeatureCardAnalytics() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="mt-4 overflow-hidden rounded-control border border-border bg-muted/20 px-2 py-2.5">
      <svg viewBox="0 0 256 122" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        <defs>
          <linearGradient id="an-g1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity=".3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity=".02" />
          </linearGradient>
          <linearGradient id="an-g2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity=".2" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {/* Chart background */}
        <rect
          x="4"
          y="4"
          width="248"
          height="64"
          rx="5"
          fill="currentColor"
          fillOpacity=".04"
          stroke="currentColor"
          strokeOpacity=".08"
          strokeWidth="1"
        />
        {/* Grid lines */}
        <line
          x1="8"
          y1="54"
          x2="248"
          y2="54"
          stroke="currentColor"
          strokeOpacity=".06"
          strokeWidth=".8"
        />
        <line
          x1="8"
          y1="41"
          x2="248"
          y2="41"
          stroke="currentColor"
          strokeOpacity=".06"
          strokeWidth=".8"
        />
        <line
          x1="8"
          y1="28"
          x2="248"
          y2="28"
          stroke="currentColor"
          strokeOpacity=".06"
          strokeWidth=".8"
        />
        <line
          x1="8"
          y1="15"
          x2="248"
          y2="15"
          stroke="currentColor"
          strokeOpacity=".06"
          strokeWidth=".8"
        />
        {/* Area fills */}
        <path
          d="M8,37 48,28 88,41 128,19 168,32 208,13 248,24 L248,64 L8,64 Z"
          fill="url(#an-g1)"
        />
        <path
          d="M8,45 48,35 88,49 128,25 168,39 208,20 248,31 L248,64 L8,64 Z"
          fill="url(#an-g2)"
        />
        {/* Lines */}
        <polyline
          points="8,37 48,28 88,41 128,19 168,32 208,13 248,24"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points="8,45 48,35 88,49 128,25 168,39 208,20 248,31"
          stroke="#22c55e"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Peak highlight */}
        <circle cx="208" cy="13" r="3.5" fill="#3b82f6" />
        <circle cx="208" cy="13" r="6" fill="#3b82f6" fillOpacity=".15" />
        {/* Legend */}
        <circle cx="12" cy="10.5" r="2" fill="#3b82f6" />
        <text x="17" y="13.5" fontSize="4.5" fill="currentColor" fillOpacity=".5">
          Messages sent
        </text>
        <circle cx="72" cy="10.5" r="2" fill="#22c55e" />
        <text x="77" y="13.5" fontSize="4.5" fill="currentColor" fillOpacity=".5">
          Read
        </text>
        {/* Day labels */}
        {days.map((d, i) => (
          <text
            key={i}
            x={8 + i * 40}
            y="73"
            fontSize="4"
            fill="currentColor"
            fillOpacity=".3"
            textAnchor="middle"
          >
            {d}
          </text>
        ))}
        {/* KPI tile — Response */}
        <rect
          x="4"
          y="78"
          width="118"
          height="40"
          rx="5"
          fill="currentColor"
          fillOpacity=".05"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth="1"
        />
        <rect x="8" y="81" width="50" height="7" rx="3" fill="#3b82f6" fillOpacity=".7" />
        <text x="12" y="87" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          Avg. Response
        </text>
        <text x="8" y="104" fontSize="14" fill="#3b82f6" fillOpacity=".95" fontWeight="800">
          4m 12s
        </text>
        <text x="8" y="114" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          18% faster vs last week
        </text>
        {/* KPI tile — CSAT */}
        <rect
          x="130"
          y="78"
          width="122"
          height="40"
          rx="5"
          fill="currentColor"
          fillOpacity=".05"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth="1"
        />
        <rect x="134" y="81" width="38" height="7" rx="3" fill="#f59e0b" fillOpacity=".75" />
        <text x="138" y="87" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          CSAT Score
        </text>
        <text x="134" y="104" fontSize="14" fill="#f59e0b" fillOpacity=".95" fontWeight="800">
          4.8
        </text>
        <text x="154" y="104" fontSize="11" fill="#f59e0b" fillOpacity=".85">
          &#9733;
        </text>
        <text x="134" y="114" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          342 ratings · last 30 days
        </text>
      </svg>
    </div>
  );
}

function FeatureCardHelpdesk() {
  return (
    <div className="mt-4 overflow-hidden rounded-control border border-border bg-muted/20 px-2 py-2.5">
      <svg viewBox="0 0 256 118" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        <defs>
          <marker id="hd-y" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#f59e0b" fillOpacity=".6" />
          </marker>
          <marker id="hd-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#22c55e" fillOpacity=".6" />
          </marker>
        </defs>
        {/* OPEN column */}
        <rect
          x="4"
          y="4"
          width="76"
          height="82"
          rx="5"
          fill="currentColor"
          fillOpacity=".04"
          stroke="#ef4444"
          strokeOpacity=".2"
          strokeWidth="1"
        />
        <rect x="8" y="7" width="28" height="7" rx="3" fill="#ef4444" fillOpacity=".7" />
        <text x="12" y="13" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          OPEN
        </text>
        <text x="50" y="13.5" fontSize="7" fill="#ef4444" fontWeight="800">
          12
        </text>
        <rect
          x="8"
          y="20"
          width="68"
          height="18"
          rx="3"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <circle cx="13" cy="29" r="2.5" fill="#ef4444" fillOpacity=".7" />
        <text x="18" y="27.5" fontSize="4.5" fill="currentColor" fillOpacity=".65" fontWeight="600">
          #1042 · Sarah J.
        </text>
        <text x="18" y="34.5" fontSize="4" fill="currentColor" fillOpacity=".4">
          Billing issue · High
        </text>
        <rect
          x="8"
          y="42"
          width="68"
          height="18"
          rx="3"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <circle cx="13" cy="51" r="2.5" fill="#ef4444" fillOpacity=".7" />
        <text x="18" y="49.5" fontSize="4.5" fill="currentColor" fillOpacity=".65" fontWeight="600">
          #1043 · Ahmed H.
        </text>
        <text x="18" y="56.5" fontSize="4" fill="currentColor" fillOpacity=".4">
          Refund request · Med
        </text>
        <rect
          x="8"
          y="64"
          width="68"
          height="18"
          rx="3"
          fill="currentColor"
          fillOpacity=".04"
          stroke="currentColor"
          strokeOpacity=".07"
          strokeWidth=".8"
        />
        <circle cx="13" cy="73" r="2.5" fill="#ef4444" fillOpacity=".4" />
        <text x="18" y="71.5" fontSize="4.5" fill="currentColor" fillOpacity=".5" fontWeight="600">
          #1044 · James K.
        </text>
        <text x="18" y="78.5" fontSize="4" fill="currentColor" fillOpacity=".35">
          Onboarding help · Low
        </text>
        {/* Arrow Open→Pending */}
        <line
          x1="80"
          y1="43"
          x2="90"
          y2="43"
          stroke="#f59e0b"
          strokeWidth="1.2"
          strokeOpacity=".5"
          markerEnd="url(#hd-y)"
        />
        {/* PENDING column */}
        <rect
          x="90"
          y="4"
          width="76"
          height="82"
          rx="5"
          fill="currentColor"
          fillOpacity=".04"
          stroke="#f59e0b"
          strokeOpacity=".2"
          strokeWidth="1"
        />
        <rect x="94" y="7" width="36" height="7" rx="3" fill="#f59e0b" fillOpacity=".7" />
        <text x="98" y="13" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          PENDING
        </text>
        <text x="138" y="13.5" fontSize="7" fill="#f59e0b" fontWeight="800">
          5
        </text>
        <rect
          x="94"
          y="20"
          width="68"
          height="18"
          rx="3"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <circle cx="99" cy="29" r="2.5" fill="#f59e0b" fillOpacity=".7" />
        <text
          x="104"
          y="27.5"
          fontSize="4.5"
          fill="currentColor"
          fillOpacity=".65"
          fontWeight="600"
        >
          #1038 · Maria G.
        </text>
        <text x="104" y="34.5" fontSize="4" fill="currentColor" fillOpacity=".4">
          Awaiting reply · Med
        </text>
        <rect
          x="94"
          y="42"
          width="68"
          height="18"
          rx="3"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <circle cx="99" cy="51" r="2.5" fill="#f59e0b" fillOpacity=".7" />
        <text
          x="104"
          y="49.5"
          fontSize="4.5"
          fill="currentColor"
          fillOpacity=".65"
          fontWeight="600"
        >
          #1041 · Chen L.
        </text>
        <text x="104" y="56.5" fontSize="4" fill="currentColor" fillOpacity=".4">
          Under review · Low
        </text>
        <rect
          x="94"
          y="64"
          width="68"
          height="18"
          rx="3"
          fill="currentColor"
          fillOpacity=".04"
          stroke="currentColor"
          strokeOpacity=".06"
          strokeWidth=".8"
        />
        <text
          x="128"
          y="75"
          fontSize="4.5"
          fill="currentColor"
          fillOpacity=".3"
          textAnchor="middle"
        >
          +3 more
        </text>
        {/* Arrow Pending→Resolved */}
        <line
          x1="166"
          y1="43"
          x2="176"
          y2="43"
          stroke="#22c55e"
          strokeWidth="1.2"
          strokeOpacity=".5"
          markerEnd="url(#hd-g)"
        />
        {/* RESOLVED column */}
        <rect
          x="176"
          y="4"
          width="76"
          height="82"
          rx="5"
          fill="currentColor"
          fillOpacity=".04"
          stroke="#22c55e"
          strokeOpacity=".2"
          strokeWidth="1"
        />
        <rect x="180" y="7" width="42" height="7" rx="3" fill="#22c55e" fillOpacity=".7" />
        <text x="184" y="13" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          RESOLVED
        </text>
        <text x="228" y="13.5" fontSize="7" fill="#22c55e" fontWeight="800">
          48
        </text>
        <rect
          x="180"
          y="20"
          width="68"
          height="18"
          rx="3"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <text x="186" y="27.5" fontSize="4.5" fill="currentColor" fillOpacity=".6" fontWeight="600">
          #1030 · Priya M. &#10003;
        </text>
        <text x="186" y="34.5" fontSize="4" fill="currentColor" fillOpacity=".35">
          Closed · 1h 32m
        </text>
        <rect
          x="180"
          y="42"
          width="68"
          height="18"
          rx="3"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <text x="186" y="49.5" fontSize="4.5" fill="currentColor" fillOpacity=".6" fontWeight="600">
          #1031 · Li W. &#10003;
        </text>
        <text x="186" y="56.5" fontSize="4" fill="currentColor" fillOpacity=".35">
          Closed · 45m
        </text>
        <rect
          x="180"
          y="64"
          width="68"
          height="18"
          rx="3"
          fill="currentColor"
          fillOpacity=".04"
          stroke="currentColor"
          strokeOpacity=".06"
          strokeWidth=".8"
        />
        <text
          x="214"
          y="75"
          fontSize="4.5"
          fill="currentColor"
          fillOpacity=".3"
          textAnchor="middle"
        >
          +46 more &#10003;
        </text>
        {/* SLA alert */}
        <rect
          x="4"
          y="94"
          width="248"
          height="20"
          rx="5"
          fill="#ef4444"
          fillOpacity=".06"
          stroke="#ef4444"
          strokeOpacity=".2"
          strokeWidth="1"
        />
        <circle cx="14" cy="104" r="3" fill="#ef4444" fillOpacity=".8" />
        <text x="21" y="107" fontSize="5" fill="#ef4444" fillOpacity=".85" fontWeight="600">
          SLA breach in 18 min · Ticket #1042 · Billing issue — High priority
        </text>
      </svg>
    </div>
  );
}

function FeatureCardCommerce() {
  return (
    <div className="mt-4 overflow-hidden rounded-control border border-border bg-muted/20 px-2 py-2.5">
      <svg viewBox="0 0 256 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        <defs>
          <marker id="cm-t" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#14b8a6" fillOpacity=".7" />
          </marker>
        </defs>
        {/* Catalog node */}
        <rect
          x="4"
          y="4"
          width="146"
          height="102"
          rx="5"
          fill="currentColor"
          fillOpacity=".04"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth="1"
        />
        <rect x="8" y="7" width="60" height="7" rx="3" fill="#14b8a6" fillOpacity=".75" />
        <circle cx="13" cy="10.5" r="2" fill="#fff" fillOpacity=".9" />
        <text x="17" y="13.5" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          WhatsApp Catalog
        </text>
        {/* Product 1 */}
        <rect
          x="8"
          y="20"
          width="138"
          height="28"
          rx="4"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".08"
          strokeWidth=".8"
        />
        <rect x="12" y="24" width="20" height="20" rx="3" fill="#14b8a6" fillOpacity=".15" />
        <rect x="16" y="28" width="12" height="12" rx="2" fill="#14b8a6" fillOpacity=".35" />
        <text x="38" y="31" fontSize="5" fill="currentColor" fillOpacity=".75" fontWeight="700">
          Premium Bundle
        </text>
        <text x="38" y="39" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          All features · WhatsApp + 5 channels
        </text>
        <text x="38" y="46" fontSize="6" fill="#14b8a6" fontWeight="800">
          $49 / mo
        </text>
        <rect x="118" y="25" width="24" height="14" rx="3" fill="#14b8a6" fillOpacity=".8" />
        <text x="130" y="35" fontSize="5" fill="#fff" fontWeight="700" textAnchor="middle">
          Add
        </text>
        {/* Product 2 */}
        <rect
          x="8"
          y="52"
          width="138"
          height="28"
          rx="4"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".08"
          strokeWidth=".8"
        />
        <rect x="12" y="56" width="20" height="20" rx="3" fill="#3b82f6" fillOpacity=".12" />
        <rect x="16" y="60" width="12" height="12" rx="2" fill="#3b82f6" fillOpacity=".3" />
        <text x="38" y="63" fontSize="5" fill="currentColor" fillOpacity=".75" fontWeight="700">
          Starter Plan
        </text>
        <text x="38" y="71" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          WhatsApp · 1 agent · Core features
        </text>
        <text x="38" y="78" fontSize="6" fill="#3b82f6" fontWeight="800">
          $19 / mo
        </text>
        <rect x="118" y="57" width="24" height="14" rx="3" fill="#3b82f6" fillOpacity=".75" />
        <text x="130" y="67" fontSize="5" fill="#fff" fontWeight="700" textAnchor="middle">
          Add
        </text>
        {/* Cart */}
        <rect
          x="8"
          y="84"
          width="138"
          height="16"
          rx="3"
          fill="#14b8a6"
          fillOpacity=".08"
          stroke="#14b8a6"
          strokeOpacity=".2"
          strokeWidth=".8"
        />
        <text x="14" y="94.5" fontSize="4.5" fill="currentColor" fillOpacity=".5">
          Cart · 2 items
        </text>
        <text x="140" y="94.5" fontSize="5.5" fill="#14b8a6" fontWeight="800" textAnchor="end">
          $68.00
        </text>
        {/* Arrow catalog → order */}
        <path
          d="M150,55 C160,55 164,66 174,66"
          stroke="#14b8a6"
          strokeWidth="1.5"
          strokeOpacity=".55"
          fill="none"
          markerEnd="url(#cm-t)"
        />
        {/* Order node */}
        <rect
          x="174"
          y="4"
          width="78"
          height="102"
          rx="5"
          fill="currentColor"
          fillOpacity=".04"
          stroke="#14b8a6"
          strokeOpacity=".2"
          strokeWidth="1"
        />
        <rect x="178" y="7" width="40" height="7" rx="3" fill="#14b8a6" fillOpacity=".7" />
        <text x="182" y="13" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          Order Created
        </text>
        <text x="178" y="28" fontSize="4.5" fill="currentColor" fillOpacity=".35">
          Order ID
        </text>
        <text x="178" y="36" fontSize="5.5" fill="currentColor" fillOpacity=".75" fontWeight="700">
          #ORD-2847
        </text>
        <rect
          x="178"
          y="40"
          width="70"
          height="14"
          rx="3"
          fill="#22c55e"
          fillOpacity=".1"
          stroke="#22c55e"
          strokeOpacity=".25"
          strokeWidth=".8"
        />
        <text x="213" y="49.5" fontSize="5" fill="#22c55e" fontWeight="700" textAnchor="middle">
          &#10003; Confirmed
        </text>
        <text x="178" y="65" fontSize="4.5" fill="currentColor" fillOpacity=".35">
          Items
        </text>
        <text x="178" y="73" fontSize="4.5" fill="currentColor" fillOpacity=".55">
          · Premium Bundle
        </text>
        <text x="178" y="80" fontSize="4.5" fill="currentColor" fillOpacity=".55">
          · Starter Plan
        </text>
        <line
          x1="178"
          y1="84"
          x2="244"
          y2="84"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <text x="178" y="93" fontSize="4.5" fill="currentColor" fillOpacity=".35">
          Total
        </text>
        <text x="244" y="93" fontSize="6" fill="#14b8a6" fontWeight="800" textAnchor="end">
          $68.00
        </text>
        <rect x="178" y="96" width="70" height="5" rx="2" fill="#25D366" fillOpacity=".35" />
        {/* Bottom WA notification */}
        <rect
          x="4"
          y="114"
          width="248"
          height="32"
          rx="5"
          fill="currentColor"
          fillOpacity=".04"
          stroke="currentColor"
          strokeOpacity=".08"
          strokeWidth="1"
        />
        <rect
          x="10"
          y="120"
          width="28"
          height="20"
          rx="3"
          fill="#25D366"
          fillOpacity=".12"
          stroke="#25D366"
          strokeOpacity=".2"
          strokeWidth=".8"
        />
        <text x="24" y="133.5" fontSize="9" fill="#25D366" textAnchor="middle" fontWeight="800">
          W
        </text>
        <text x="46" y="124" fontSize="5" fill="currentColor" fillOpacity=".65" fontWeight="600">
          WhatsApp order update sent to customer
        </text>
        <text x="46" y="133" fontSize="4.5" fill="currentColor" fillOpacity=".35">
          Order #ORD-2847 confirmed · Tracking link attached
        </text>
        <rect x="196" y="118" width="50" height="20" rx="4" fill="#25D366" fillOpacity=".8" />
        <text x="221" y="130.5" fontSize="5" fill="#fff" fontWeight="700" textAnchor="middle">
          View Order
        </text>
      </svg>
    </div>
  );
}

function FeatureCardAppointments() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const slots = [
    false,
    true,
    false,
    true,
    true,
    false,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    false,
  ];
  return (
    <div className="mt-4 overflow-hidden rounded-control border border-border bg-muted/20 px-2 py-2.5">
      <style>{`
        @keyframes ap-flow{to{stroke-dashoffset:-18}}
        @keyframes ap-blink{0%,100%{opacity:1}50%{opacity:.35}}
        .ap-f{animation:ap-flow 1.4s linear infinite;stroke-dasharray:5 3.5}
        .ap-bk{animation:ap-blink 2s ease-in-out infinite}
      `}</style>
      <svg viewBox="0 0 256 152" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        <defs>
          <marker id="ap-v" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L0 6L6 3z" fill="#8b5cf6" fillOpacity=".7" />
          </marker>
        </defs>
        {/* Calendar node */}
        <rect
          x="4"
          y="4"
          width="142"
          height="104"
          rx="5"
          fill="currentColor"
          fillOpacity=".04"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth="1"
        />
        <rect x="8" y="7" width="58" height="7" rx="3" fill="#8b5cf6" fillOpacity=".75" />
        <circle cx="13" cy="10.5" r="2" fill="#fff" fillOpacity=".9" className="ap-bk" />
        <text x="17" y="13.5" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          Booking Calendar
        </text>
        <text x="108" y="13.5" fontSize="4.5" fill="currentColor" fillOpacity=".4">
          Oct 2026
        </text>
        {/* Day headers */}
        {days.map((d, i) => (
          <text
            key={i}
            x={14 + i * 18}
            y="26"
            fontSize="4.5"
            fill="currentColor"
            fillOpacity=".35"
            textAnchor="middle"
            fontWeight="600"
          >
            {d}
          </text>
        ))}
        {/* Calendar slots */}
        {slots.map((active, i) => {
          const col = i % 7;
          const row = Math.floor(i / 7);
          const cx = 14 + col * 18;
          const cy = 36 + row * 18;
          return (
            <g key={i}>
              <rect
                x={cx - 7}
                y={cy - 7}
                width="14"
                height="14"
                rx="3"
                fill={active ? "#8b5cf6" : "currentColor"}
                fillOpacity={active ? ".75" : ".05"}
                stroke={active ? "#8b5cf6" : "currentColor"}
                strokeOpacity={active ? ".4" : ".08"}
                strokeWidth=".8"
              />
              <text
                x={cx}
                y={cy + 3.5}
                fontSize="4.5"
                fill={active ? "#fff" : "currentColor"}
                fillOpacity={active ? ".95" : ".3"}
                textAnchor="middle"
                fontWeight={active ? "700" : "400"}
              >
                {i + 8}
              </text>
            </g>
          );
        })}
        {/* Next appointment */}
        <rect
          x="8"
          y="90"
          width="134"
          height="14"
          rx="3"
          fill="#8b5cf6"
          fillOpacity=".1"
          stroke="#8b5cf6"
          strokeOpacity=".2"
          strokeWidth=".8"
        />
        <circle cx="14" cy="97" r="2" fill="#8b5cf6" fillOpacity=".8" />
        <text x="19" y="100" fontSize="4.5" fill="#8b5cf6" fillOpacity=".85" fontWeight="600">
          Next: Today 3:00 PM · Demo call
        </text>
        {/* Arrow calendar → confirmation */}
        <line
          x1="146"
          y1="56"
          x2="160"
          y2="56"
          stroke="#8b5cf6"
          strokeWidth="1.5"
          strokeOpacity=".55"
          className="ap-f"
          markerEnd="url(#ap-v)"
        />
        {/* Booking Confirmation node */}
        <rect
          x="160"
          y="4"
          width="92"
          height="104"
          rx="5"
          fill="currentColor"
          fillOpacity=".04"
          stroke="#8b5cf6"
          strokeOpacity=".2"
          strokeWidth="1"
        />
        <rect x="164" y="7" width="48" height="7" rx="3" fill="#8b5cf6" fillOpacity=".7" />
        <text x="168" y="13" fontSize="5" fill="#fff" fillOpacity=".95" fontWeight="700">
          Booking Confirmed
        </text>
        <text x="164" y="28" fontSize="4.5" fill="currentColor" fillOpacity=".35">
          Customer
        </text>
        <text x="164" y="36" fontSize="5" fill="currentColor" fillOpacity=".7" fontWeight="600">
          Sarah Johnson
        </text>
        <text x="164" y="48" fontSize="4.5" fill="currentColor" fillOpacity=".35">
          Service
        </text>
        <text x="164" y="56" fontSize="5" fill="currentColor" fillOpacity=".7" fontWeight="600">
          Demo Call · 30 min
        </text>
        <text x="164" y="68" fontSize="4.5" fill="currentColor" fillOpacity=".35">
          Date &amp; Time
        </text>
        <text x="164" y="76" fontSize="5" fill="currentColor" fillOpacity=".7" fontWeight="600">
          Oct 9 · 3:00 PM
        </text>
        <rect
          x="164"
          y="81"
          width="84"
          height="14"
          rx="3"
          fill="#22c55e"
          fillOpacity=".1"
          stroke="#22c55e"
          strokeOpacity=".28"
          strokeWidth=".8"
        />
        <text x="206" y="90.5" fontSize="5" fill="#22c55e" fontWeight="700" textAnchor="middle">
          &#10003; WA Reminder Sent
        </text>
        {/* Bottom upcoming bar */}
        <rect
          x="4"
          y="116"
          width="248"
          height="32"
          rx="5"
          fill="#8b5cf6"
          fillOpacity=".05"
          stroke="#8b5cf6"
          strokeOpacity=".12"
          strokeWidth="1"
        />
        <text x="14" y="126" fontSize="5" fill="currentColor" fillOpacity=".55" fontWeight="600">
          Upcoming
        </text>
        <rect
          x="14"
          y="129"
          width="62"
          height="13"
          rx="3"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <text
          x="45"
          y="137.5"
          fontSize="4"
          fill="currentColor"
          fillOpacity=".5"
          textAnchor="middle"
        >
          Oct 9 · 3:00 PM
        </text>
        <rect
          x="82"
          y="129"
          width="62"
          height="13"
          rx="3"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <text
          x="113"
          y="137.5"
          fontSize="4"
          fill="currentColor"
          fillOpacity=".5"
          textAnchor="middle"
        >
          Oct 10 · 10:00 AM
        </text>
        <rect
          x="150"
          y="129"
          width="62"
          height="13"
          rx="3"
          fill="currentColor"
          fillOpacity=".06"
          stroke="currentColor"
          strokeOpacity=".1"
          strokeWidth=".8"
        />
        <text
          x="181"
          y="137.5"
          fontSize="4"
          fill="currentColor"
          fillOpacity=".5"
          textAnchor="middle"
        >
          Oct 11 · 2:00 PM
        </text>
        <rect x="218" y="129" width="28" height="13" rx="3" fill="#8b5cf6" fillOpacity=".7" />
        <text x="232" y="137.5" fontSize="4.5" fill="#fff" fontWeight="700" textAnchor="middle">
          +9
        </text>
      </svg>
    </div>
  );
}

// Small "+" mark centered exactly on a border intersection — reusable across
// any `relative` bordered block. The translate direction has to flip per
// corner (top/left corners pull back toward 0, bottom/right corners push
// forward past 100%) or the mark centers on the wrong side of the line.
function CornerPlus({
  corner,
  className,
  size = "size-3.5",
}: {
  corner: "tl" | "tr" | "bl" | "br";
  /** Color override for marks on a dark/inverse surface (default: text-foreground/90). */
  className?: string;
  /** Tailwind size-* class — override when the mark sits on a thicker/wider line. */
  size?: string;
}) {
  const vertical = corner[0] === "t" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2";
  const horizontal = corner[1] === "l" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2";
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className={`absolute z-10 ${size} ${className ?? "text-foreground/90"} ${vertical} ${horizontal}`}
    >
      <path d="M5 0v10M0 5h10" stroke="currentColor" strokeWidth="0.3" />
    </svg>
  );
}

type PlatformCard = {
  title: string;
  desc: string;
  image: string;
};

function Features() {
  const leftCards: PlatformCard[] = [
    {
      title: "Shared Inbox",
      desc: "Every channel, one queue — assign, tag, snooze and hand off between bot and human without losing a message.",
      image: featureSharedInboxImg,
    },
    {
      title: "AI Studio",
      desc: "Reply suggestions, summaries and sentiment — powered by Gemini, OpenAI, Anthropic or Groq.",
      image: featureAiStudioImg,
    },
    {
      title: "Automations",
      desc: "Trigger-based workflows for welcome messages, tagging, escalation and off-hours auto-reply.",
      image: featureAutomationsImg,
    },
  ];

  const rightCards: PlatformCard[] = [
    {
      title: "Broadcast Campaigns",
      desc: "Approved templates, segmented lists and throttled sending with per-message delivery reporting.",
      image: featureBroadcastImg,
    },
    {
      title: "Analytics",
      desc: "Delivery, read, response and CSAT metrics with team-level performance breakdowns.",
      image: featureAnalyticsImg,
    },
    {
      title: "Helpdesk & SLA",
      desc: "Tickets, priorities, business hours and automatic breach alerts on every thread.",
      image: featureHelpdeskImg,
    },
  ];

  const pillars = [
    {
      icon: MessagesSquare,
      title: "Omnichannel Messaging",
      desc: "Manage WhatsApp, Messenger, Instagram, Telegram and Email from one unified inbox.",
    },
    {
      icon: Users,
      title: "Team Collaboration",
      desc: "Assign conversations, share context and keep every team member aligned.",
    },
    {
      icon: BarChart3,
      title: "CRM & Sales",
      desc: "Turn conversations into leads, customers and stronger business relationships.",
    },
    {
      icon: Zap,
      title: "Automation & Bots",
      desc: "Automate repetitive tasks with workflows, chatbots and smart routing.",
    },
  ];

  // Shared Inbox is active by default; hovering another card switches to it,
  // and the panel stays on the last-hovered card instead of resetting.
  const [active, setActive] = useState<{ side: "left" | "right"; index: number }>({
    side: "left",
    index: 0,
  });
  return (
    <section id="features" className="section-marketing relative scroll-mt-24">
      <div className="container-marketing relative pb-8 border-b border-border md:pb-16">
        <div className="mx-auto max-w-xl text-center">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
            Platform Featues
          </span>
          <h2 className="text-marketing-title mt-5 leading-tight">
            Everything you need to run omnichannel support at scale.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Forty-plus modules share one contact graph, so a chatbot, a campaign and a sales rep all
            see the same customer.
          </p>
        </div>
      </div>

      <div className="border-b border-border">
        <div className="relative mx-auto max-w-(--content-max-xl)">
          <CornerPlus corner="bl" size="size-4" />
          <CornerPlus corner="br" size="size-4" />

          <div className="grid grid-cols-1 border-x border-border md:grid-cols-3">
            {/* Left column */}
            <div className="flex flex-col border-border md:border-r">
              {leftCards.map((card, i) => (
                <div
                  key={card.title}
                  onMouseEnter={() => setActive({ side: "left", index: i })}
                  className={`px-8 py-9 transition-colors md:px-12 ${i !== leftCards.length - 1 ? "border-b border-border" : ""} ${active.side === "left" && active.index === i ? "bg-muted/50" : ""}`}
                >
                  <p className="text-[13px] font-semibold text-foreground">{card.title}</p>
                  <p className="mt-2 line-clamp-2 text-base leading-relaxed text-muted-foreground">
                    {card.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Center image — full-bleed, crossfades + scales on hover/change */}
            <div
              className="relative min-h-80 overflow-hidden border-t border-border md:border-t-0"
              style={{ padding: 24, background: "#eee" }}
            >
              {[
                ...leftCards.map((card, i) => ({ card, side: "left" as const, index: i })),
                ...rightCards.map((card, i) => ({ card, side: "right" as const, index: i })),
              ].map(({ card, side, index }) => {
                const isActive = active.side === side && active.index === index;
                return (
                  <img
                    key={card.title}
                    src={card.image}
                    alt={card.title}
                    className="absolute inset-0 h-full w-full object-cover transition-all duration-500 ease-out"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? "scale(1)" : "scale(1.04)",
                    }}
                  />
                );
              })}
            </div>

            {/* Right column */}
            <div className="flex flex-col border-t border-border md:border-l md:border-t-0">
              {rightCards.map((card, i) => (
                <div
                  key={card.title}
                  onMouseEnter={() => setActive({ side: "right", index: i })}
                  className={`px-8 py-9 transition-colors md:px-12 ${i !== rightCards.length - 1 ? "border-b border-border" : ""} ${active.side === "right" && active.index === i ? "bg-muted/50" : ""}`}
                >
                  <p className="text-[13px] font-semibold text-foreground">{card.title}</p>
                  <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                    {card.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Four pillars — why teams pick WACRM, folded into Platform Features */}
          <div className="container-marketing border-t border-border pt-12 pb-8 md:pt-16 md:pb-12">
            <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 md:divide-x md:divide-border">
              {pillars.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="md:px-6 md:first:pl-0 md:last:pr-0">
                  <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Isometric platform stack — four layers (channels → AI →      */
/* CRM → your data) threaded with brand/feature icons along a   */
/* diagonal, inside a dotted isometric box wireframe.            */
/* ============================================================ */
function PlatformStackIllustration() {
  const brandName = useBrandName();
  return (
    // lg:flex-1 + lg:self-stretch (flexbox, not grid — grid's percentage-height
    // stretch is unreliable here) matches this to the text column's full
    // height; object-bottom then anchors the artwork to the bottom edge so it
    // lines up with the CTA button beside it, instead of its top.
    <div className="relative mx-auto aspect-square w-full max-w-md lg:aspect-auto lg:h-auto lg:max-w-none lg:flex-1 lg:self-stretch">
      {/* <div
        aria-hidden
        className="absolute -right-8 -top-8 size-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-10 -left-8 size-56 rounded-full bg-accent/15 blur-3xl"
      /> */}

      <div className="relative h-full w-full overflow-hidden rounded-control border border-border bg-muted/50 p-6 ">
        {/* A normal in-flow block respects the parent's padding directly —
            an `absolute inset-0` image ignores padding unless height/width
            are left unset, which fought with object-cover here. */}
        <img
          src={platformStackImg}
          alt={`Isometric diagram of the ${brandName} platform stack: omnichannel messaging, AI and automation, CRM and sales, and your business data`}
          className="block h-full w-full rounded-control object-cover object-center transition-all duration-500 ease-out"
        />

        {/* Brand badge overlaid on the stock illustration */}
        <span className="absolute left-[8%] top-[6%] inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground ">
          <PlatformLogo alt="" className="size-3.5 shrink-0 object-contain" />
          <BrandWordmark /> Platform
        </span>

        {/* Caption chip, bottom-right */}
        <span className="absolute bottom-[6%] right-[8%] inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background ">
          <Workflow className="size-3.5" />
          One connected stack
        </span>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Industry / use cases — six verticals + an illustrated inbox   */
/* mockup, directly below Platform Features.                     */
/* ============================================================ */
function IndustryUseCases() {
  const industries = [
    {
      icon: ShoppingCart,
      title: "E-commerce & Retail",
      desc: "Turn customer inquiries into sales with connected conversations and faster support.",
      color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    },
    {
      icon: Store,
      title: "Local Businesses",
      desc: "Manage customer messages, appointments and everyday communication in one workspace.",
      color: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    },
    {
      icon: Building2,
      title: "Real Estate & Property",
      desc: "Capture inquiries, organize leads and keep every property conversation moving.",
      color: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
    },
    {
      icon: GraduationCap,
      title: "Education & Training",
      desc: "Simplify student inquiries, admissions communication and follow-ups.",
      color: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    },
    {
      icon: HeartPulse,
      title: "Healthcare & Clinics",
      desc: "Coordinate patient inquiries, appointment communication and team responses.",
      color: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    },
    {
      icon: Plane,
      title: "Hospitality & Travel",
      desc: "Deliver more connected guest experiences, from first inquiry to ongoing support.",
      color: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400",
    },
  ];

  return (
    <section
      id="industries"
      className="section-marketing scroll-mt-24 bg-muted/80 border-b border-border"
    >
      <div className="relative container-marketing">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />
        <div className="flex flex-wrap items-end justify-between gap-6 row-bleed-marketing border-b border-border pb-8">
          <div>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Built for every industry
            </span>
            <h2 className="text-marketing-title mt-4 leading-tight">
              One platform. Endless possibilities.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              From growing businesses to established teams, <Brand /> brings customer conversations,
              sales and automation together.
            </p>
          </div>

          <Button asChild variant="primary" size="lg" className="shrink-0">
            <Link to="/features" {...ctaAttrs("explore-all-solutions", "industry-use-cases")}>
              Explore all solutions <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>

        {/* Image aligns with just the card grid, not the copy/CTA row above */}
        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-stretch">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex-[1.05]">
            {industries.map(({ icon: Icon, title, desc, color }) => (
              <div
                key={title}
                className="flex flex-col rounded-control border border-border bg-background p-5 transition-shadow hover:shadow-sm sm:p-6"
              >
                <span
                  className={`flex size-12 items-center justify-center rounded-control ${color}`}
                >
                  <Icon className="size-5" />
                </span>
                <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
                <div className="flex-1" />
                <button
                  type="button"
                  aria-label={`Explore ${title}`}
                  className="mt-6 flex size-8 shrink-0 items-center justify-center self-start rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50 hover:text-foreground"
                >
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Right — isometric platform stack: channels → AI → CRM → your data */}
          <PlatformStackIllustration />
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Unified inbox spotlight — dedicated deep-dive on the shared    */
/* omnichannel inbox, with an illustrated browser mockup.         */
/* ============================================================ */
function UnifiedInboxSpotlight() {
  const highlights = [
    {
      num: "01",
      title: "All Conversations in One Place",
      desc: "Manage messages from every connected channel without switching between apps.",
    },
    {
      num: "02",
      title: "Seamless Team Collaboration",
      desc: "Assign conversations, coordinate responses, and keep your team working together.",
    },
    {
      num: "03",
      title: "Complete Customer Context",
      desc: "Access customer profiles, conversation history, tags, and CRM information alongside every chat.",
    },
    {
      num: "04",
      title: "Smarter Conversation Management",
      desc: "Organize conversations with filters, statuses, ownership, and quick actions.",
    },
  ];

  // Hovering a highlight calls out the matching zone of the inbox mockup on
  // the right; the mockup stays on the last-hovered zone instead of resetting.
  const [active, setActive] = useState(0);

  return (
    <section className="relative section-marketing border-b border-border bg-surface">
      <div className="relative container-marketing p-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        {/* Header row */}
        <div className="grid min-w-0 grid-cols-1 items-end gap-0 border-b border-border lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — title */}
          <div className="min-w-0 border-border px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-12 lg:border-r lg:py-12">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Unified Omnichannel Inbox
            </span>
            <h2 className="text-marketing-title mt-5 leading-tight">
              Every channel.
              <br />
              One powerful inbox.
            </h2>
          </div>
          {/* Centre — lede with left accent border */}
          <div className="flex min-w-0 flex-col items-start gap-6 px-5 pb-9 pt-5 sm:px-8 sm:pb-12 sm:pt-6 lg:flex-row lg:items-end lg:gap-8 lg:py-12">
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Bring WhatsApp, Messenger, Instagram, Telegram, and Email conversations together in
              one shared workspace. Respond faster, collaborate effortlessly, and keep every
              customer interaction organized.
            </p>
            {/* Right — text CTA */}
            <div className="shrink-0">
              <Link
                to="/features"
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground transition-colors hover:text-primary"
              >
                Omnichannel Inbox <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 items-stretch lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — copy */}
          <div className="flex min-w-0 flex-col border-r border-border">
            <ul className="p-0 m-0 list-none">
              {highlights.map((h, i) => (
                <li
                  key={h.num}
                  onMouseEnter={() => setActive(i)}
                  className={`flex gap-4 p-8 border-b border-border transition-colors cursor-default ${
                    active === i ? "bg-muted/50" : ""
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-base font-semibold transition-colors ${
                      active === i ? "bg-primary text-white" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {h.num}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{h.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {h.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-auto grid grid-cols-2 items-center gap-0 border-b lg:border-b-0 lg:border-t border-border px-0 m-0">
              <button
                type="button"
                onClick={() => setActive((i) => (i - 1 + highlights.length) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none border-r border-border font-medium"
              >
                <ArrowLeft className="size-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setActive((i) => (i + 1) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none"
              >
                Next
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Right — illustrated inbox mockup */}
          <UnifiedInboxMockup active={active} />
        </div>
      </div>
    </section>
  );
}

function UnifiedInboxMockup({ active = 0 }: { active?: number }) {
  // Placeholder zone call-outs standing in for real screenshots/components —
  // index matches the left-hand numbered highlights (01-04) so hovering one
  // rings the matching part of the mockup. Swap for real content later.
  const zoneRing = (zone: number) =>
    active === zone ? "ring-2 ring-inset ring-[#015941]" : "ring-2 ring-inset ring-transparent";

  const channelDots = [
    { Icon: SiWhatsapp, bg: "#25D366" },
    { Icon: SiMessenger, bg: "#0084FF" },
    { Icon: SiInstagram, bg: "#E1306C" },
    { Icon: SiTelegram, bg: "#2CA5E0" },
    { Icon: Mail, bg: "#4285F4" },
  ];

  const conversations = [
    {
      name: "Priya Sharma",
      snippet: "Is the order still available?",
      Icon: SiWhatsapp,
      bg: "#25D366",
      active: true,
    },
    {
      name: "Daniel Cruz",
      snippet: "Thanks for the quick reply!",
      Icon: SiMessenger,
      bg: "#0084FF",
    },
    {
      name: "Amara Okafor",
      snippet: "Can I get a discount code?",
      Icon: SiInstagram,
      bg: "#E1306C",
    },
    { name: "Tom Becker", snippet: "Sent the invoice, please check.", Icon: Mail, bg: "#4285F4" },
    { name: "Lena Fischer", snippet: "See you at 3pm then!", Icon: SiTelegram, bg: "#2CA5E0" },
    {
      name: "Sophie Laurent",
      snippet: "Do you ship internationally?",
      Icon: SiInstagram,
      bg: "#E1306C",
    },
    {
      name: "Marcus Webb",
      snippet: "Received the samples, thank you!",
      Icon: SiWhatsapp,
      bg: "#25D366",
    },
    {
      name: "Isabella Rossi",
      snippet: "Can we reschedule the call?",
      Icon: SiMessenger,
      bg: "#0084FF",
    },
  ];

  // Shuffle the conversation list to the front per selected highlight, so the
  // list visibly reorders (not just the main panel) — indices into
  // `conversations` above. First index in each row becomes the open thread.
  const orderByZone: Record<number, number[]> = {
    0: [0, 1, 2, 3, 4, 5, 6, 7],
    1: [1, 3, 0, 2, 4, 5, 6, 7],
    2: [2, 6, 0, 1, 3, 4, 5, 7],
    3: [4, 5, 7, 0, 1, 2, 3, 6],
  };
  const orderedConversations = orderByZone[active].map((i) => conversations[i]);
  const openContactName = orderedConversations[0].name;

  return (
    <div className="relative min-w-0 overflow-x-clip">
      {/* BG Gradient */}
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-1/3 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-80 rounded-full bg-accent/10 blur-3xl" />
      </div> */}
      <div className="relative m-3 sm:m-8 xl:m-24">
        {/* Decorative dot-grid pattern behind the whole mockup */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-10 -z-10"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1.5px, transparent 1.5px)",
            backgroundSize: "10px 10px",
            maskImage: "radial-gradient(ellipse 75% 75% at 50% 50%, black 45%, transparent 85%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 75% 75% at 50% 50%, black 45%, transparent 85%)",
          }}
        />

        {/* Decorative mint blob behind the mockup */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-4 top-6 -z-10 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-500/10"
        />

        {/* Browser chrome */}
        <div className="rounded-control border border-border bg-muted/40 p-2 sm:p-4 xl:p-6">
          <div className="relative overflow-hidden rounded-control border border-border bg-background">
            <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[11px] font-medium text-muted-foreground">
                <Brand> — Unified Inbox</Brand>
              </span>
            </div>

            <div className="grid h-120 grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[56px_180px_minmax(0,1fr)] lg:grid-cols-[56px_200px_minmax(0,1fr)]">
              {/* Dark sidebar — zone 1: Seamless Team Collaboration */}
              <div
                className={`flex flex-col items-center gap-4 border-r border-border bg-[#0b1220] py-5 transition-shadow duration-300 ${zoneRing(1)}`}
              >
                <span className="flex size-9 items-center justify-center rounded-control bg-whatsapp text-white">
                  <Inbox className="size-4.5" />
                </span>
                {[MessageSquare, Users, BarChart3, Megaphone, Ticket, Workflow].map((Icon, i) => (
                  <span
                    key={i}
                    className="flex size-9 items-center justify-center rounded-control text-white/50"
                  >
                    <Icon className="size-4" />
                  </span>
                ))}
              </div>

              {/* Conversation list — zone 0: All Conversations in One Place */}
              <div
                className={`flex flex-col border-r border-border transition-shadow duration-300 ${zoneRing(0)}`}
              >
                <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                  <span className="text-[11px] font-semibold text-foreground">All Channels</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">▾</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  {orderedConversations.map((c, i) => (
                    <div
                      key={c.name}
                      className={`flex items-start gap-2 border-b border-border px-3 py-2.5 transition-colors duration-300 ${i === 0 ? "bg-emerald-50 dark:bg-emerald-500/10" : ""}`}
                    >
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ background: c.bg }}
                      >
                        <c.Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium text-foreground">{c.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{c.snippet}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main panel — content actually swaps per selected highlight
              instead of just ringing a static view (zoneRing isn't used here
              since every state 0-3 gets its own distinct view below).
              Placeholder views stand in for real screenshots. */}
              <div className="relative hidden min-w-0 overflow-hidden sm:block">
                {/* 00 — All Conversations: the live chat thread */}
                <div
                  className="absolute inset-0 flex flex-col bg-[#f3fbf5] transition-all duration-500 ease-out dark:bg-background"
                  style={{
                    opacity: active === 0 ? 1 : 0,
                    transform: active === 0 ? "scale(1)" : "scale(1.02)",
                    pointerEvents: active === 0 ? "auto" : "none",
                  }}
                >
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                    <span className="size-6 rounded-full bg-muted" />
                    <p className="text-[11px] font-semibold text-foreground">{openContactName}</p>
                    <span className="ml-auto size-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <div className="flex-1 space-y-2 overflow-hidden px-4 py-3">
                    <p className="text-center text-[9px] uppercase text-muted-foreground">
                      Today, 10:42 AM
                    </p>
                    <div className="max-w-[75%] rounded-control rounded-tl-sm border border-border bg-background px-3 py-2 text-sm text-foreground ">
                      Hi! Is the order still available?
                    </div>
                    <div className="ml-auto max-w-[75%] rounded-control rounded-tr-sm bg-whatsapp px-3 py-2 text-sm text-white ">
                      Yes! We still have it in stock 🎉
                    </div>
                    <div className="max-w-[75%] rounded-control rounded-tl-sm border border-border bg-background px-3 py-2 text-sm text-foreground ">
                      Great, I'll place the order now.
                    </div>
                    <div className="ml-auto max-w-[75%] rounded-control rounded-tr-sm bg-whatsapp px-3 py-2 text-sm text-white ">
                      Perfect! I'll send the payment link right away.
                    </div>
                    <div className="max-w-[75%] rounded-control rounded-tl-sm border border-border bg-background px-3 py-2 text-sm text-foreground ">
                      Received, paying now 👍
                    </div>
                    <div className="ml-auto max-w-[75%] rounded-control rounded-tr-sm bg-whatsapp px-3 py-2 text-sm text-white ">
                      Awesome, your order will ship today!
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-border px-3 py-2">
                    <span className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground">
                      Type a message
                    </span>
                    <span className="flex size-6 items-center justify-center rounded-full bg-whatsapp text-white">
                      <Send className="size-3" />
                    </span>
                  </div>
                </div>

                {/* 01 — Seamless Team Collaboration: assignment, mentions, internal notes */}
                <div
                  className="absolute inset-0 flex flex-col bg-background transition-all duration-500 ease-out"
                  style={{
                    opacity: active === 1 ? 1 : 0,
                    transform: active === 1 ? "scale(1)" : "scale(1.02)",
                    pointerEvents: active === 1 ? "auto" : "none",
                  }}
                >
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                    <span className="size-6 rounded-full bg-muted" />
                    <p className="text-[11px] font-semibold text-foreground">{openContactName}</p>
                    <div className="ml-auto flex items-center -space-x-1.5">
                      {["#015941", "#0284c7", "#d97706"].map((bg, i) => (
                        <span
                          key={i}
                          className="flex size-5 items-center justify-center rounded-full border-2 border-background text-[7px] font-semibold text-white"
                          style={{ background: bg }}
                        >
                          {["A", "S", "M"][i]}
                        </span>
                      ))}
                      <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-muted text-[7px] font-semibold text-muted-foreground">
                        <UserPlus className="size-2.5" />
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2.5 overflow-hidden px-4 py-3">
                    <div className="flex items-center gap-1.5 rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                      <span className="font-semibold">Internal note</span>
                      <span className="truncate">— VIP customer, prioritize response.</span>
                    </div>
                    <div className="max-w-[80%] rounded-control rounded-tl-sm border border-border bg-background px-3 py-2 text-sm text-foreground">
                      Great, I'll place the order now.
                    </div>
                    <div className="flex items-center gap-1.5 rounded-control bg-sky-50 px-3 py-2 text-[11px] text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                      <AtSign className="size-3 shrink-0" />
                      <span className="truncate">Alex — can you confirm stock before I reply?</span>
                    </div>
                    <div className="ml-auto max-w-[80%] rounded-control rounded-tr-sm bg-whatsapp px-3 py-2 text-sm text-white">
                      Perfect! I'll send the payment link right away.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
                    <span className="flex gap-0.5">
                      <span className="size-1 animate-pulse rounded-full bg-muted-foreground" />
                      <span className="size-1 animate-pulse rounded-full bg-muted-foreground [animation-delay:0.15s]" />
                      <span className="size-1 animate-pulse rounded-full bg-muted-foreground [animation-delay:0.3s]" />
                    </span>
                    Alex is typing
                  </div>
                </div>

                {/* 02 — Complete Customer Context: profile, tags, order history */}
                <div
                  className="absolute inset-0 flex flex-col bg-background transition-all duration-500 ease-out"
                  style={{
                    opacity: active === 2 ? 1 : 0,
                    transform: active === 2 ? "scale(1)" : "scale(1.02)",
                    pointerEvents: active === 2 ? "auto" : "none",
                  }}
                >
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                    <span className="size-6 rounded-full bg-muted" />
                    <p className="text-[11px] font-semibold text-foreground">{openContactName}</p>
                    <span className="ml-auto text-[9px] font-medium text-primary">
                      Full profile
                    </span>
                  </div>
                  <div className="flex-1 space-y-3 overflow-hidden px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">
                        VIP
                      </span>
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-semibold text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
                        Returning Customer
                      </span>
                    </div>
                    <div className="space-y-1.5 rounded-control border border-border bg-muted/50 p-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Mail className="size-3 shrink-0" /> priya.sharma@email.com
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Phone className="size-3 shrink-0" /> +1 (555) 012-3344
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-control border border-border p-3">
                      <div>
                        <p className="text-[9px] text-muted-foreground">Lifetime value</p>
                        <p className="text-[13px] font-semibold text-foreground">$420.00</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-muted-foreground">Orders</p>
                        <p className="text-[13px] font-semibold text-foreground">3</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-control border border-border px-3 py-2">
                      <ShoppingCart className="size-3.5 shrink-0 text-muted-foreground" />
                      <p className="truncate text-[11px] text-foreground">
                        Order #4471 — <span className="text-emerald-600">Delivered</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* 03 — Smarter Conversation Management: status board + quick actions */}
                <div
                  className="absolute inset-0 flex flex-col bg-background transition-all duration-500 ease-out"
                  style={{
                    opacity: active === 3 ? 1 : 0,
                    transform: active === 3 ? "scale(1)" : "scale(1.02)",
                    pointerEvents: active === 3 ? "auto" : "none",
                  }}
                >
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                    <Layers className="size-3.5 text-muted-foreground" />
                    <p className="text-[11px] font-semibold text-foreground">Board view</p>
                    <span className="ml-auto flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Settings className="size-3" /> Filters
                    </span>
                  </div>
                  <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-hidden p-3">
                    {[
                      { label: "Open", color: "#015941", items: ["Priya Sharma", "Marcus Webb"] },
                      {
                        label: "Pending",
                        color: "#d97706",
                        items: ["Daniel Cruz", "Lena Fischer"],
                      },
                      {
                        label: "Resolved",
                        color: "#64748b",
                        items: ["Amara Okafor", "Tom Becker"],
                      },
                    ].map((col) => (
                      <div
                        key={col.label}
                        className="flex min-h-0 flex-col gap-1.5 rounded-control border border-border bg-muted/50 p-2"
                      >
                        <div className="flex items-center gap-1.5 px-1 text-[9px] font-semibold text-foreground">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ background: col.color }}
                          />
                          {col.label}
                        </div>
                        {col.items.map((name) => (
                          <div
                            key={name}
                            className="rounded-control border border-border bg-background px-2 py-1.5 text-[9px] font-medium text-foreground shadow-sm"
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-4 border-t border-border px-4 py-2 text-muted-foreground">
                    <Clock className="size-3.5" />
                    <Check className="size-3.5" />
                    <Ticket className="size-3.5" />
                    <MoreHorizontal className="size-3.5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating channel selector — top right */}
        <div className="absolute -right-6 -top-8 hidden items-center gap-2 rounded-full border-0 bg-background p-2.5 shadow-xl sm:flex">
          {channelDots.map(({ Icon, bg }, i) => (
            <span
              key={i}
              className="flex size-9 items-center justify-center rounded-control text-white"
              style={{ background: bg }}
            >
              <Icon className="size-4.5" />
            </span>
          ))}
        </div>

        {/* Floating conversation-distribution card — bottom left — zone 3: Smarter Conversation Management */}
        <div
          className={`animate-float absolute -bottom-8 -left-8 hidden w-56 rounded-control border-0 bg-background p-5 shadow-xl transition-shadow duration-300 sm:block ${zoneRing(3)}`}
        >
          <div className="flex items-center gap-4">
            <div
              className="size-14 shrink-0 rounded-full"
              style={{
                background:
                  "conic-gradient(#015941 0 40%, #22c55e 40% 65%, #38bdf8 65% 85%, #f59e0b 85% 100%)",
              }}
            >
              <div className="m-auto mt-1.75 size-9 rounded-full bg-background" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" /> WhatsApp
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="size-1.5 rounded-full bg-sky-400" /> Messenger
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber-500" /> Other
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* CRM & Sales spotlight — pipeline deep-dive, directly below     */
/* the Unified Inbox spotlight, with an illustrated CRM mockup.   */
/* ============================================================ */
function CRMSalesSpotlight() {
  const highlights = [
    {
      num: "01",
      title: "Lead & Contact Management",
      desc: "Keep leads, contacts, and customer information organized in one centralized workspace.",
    },
    {
      num: "02",
      title: "Sales Pipeline Visibility",
      desc: "Track opportunities, manage deals, and follow every stage of your sales process.",
    },
    {
      num: "03",
      title: "Complete Customer Profiles",
      desc: "Access customer details, conversation history, tags, and ownership information in one place.",
    },
    {
      num: "04",
      title: "Sales Insights & Team Visibility",
      desc: "Stay informed with customer activities, sales performance, and clearer team coordination.",
    },
  ];

  // Hovering a highlight calls out the matching zone of the mockup; column
  // order now matches the Unified Omnichannel Inbox section exactly (narrow
  // list left, wide mockup right) — only the alive background sets this
  // section apart.
  const [active, setActive] = useState(0);

  return (
    <section className="relative section-marketing border-b border-border bg-muted/50">
      <div className="relative container-marketing p-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        {/* Header row — same 2-track template as the body grid below (narrow
            track first, wide track second) so the divider lines up. */}
        <div className="grid min-w-0 grid-cols-1 items-end gap-0 border-b border-border lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — title */}
          <div className="min-w-0 border-border px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-12 lg:border-r lg:py-12">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              CRM &amp; Sales
            </span>
            <h2 className="text-marketing-title mt-5 leading-tight">
              Turn conversations into customer relationships.
            </h2>
          </div>
          {/* Centre — lede */}
          <div className="flex min-w-0 flex-col items-start gap-6 px-5 pb-9 pt-5 sm:px-8 sm:pb-12 sm:pt-6 lg:flex-row lg:items-end lg:gap-8 lg:py-12">
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Manage leads, organize contacts, track sales opportunities, and build stronger
              customer relationships — all within your connected CRM workspace.
            </p>
            {/* Right — text CTA */}
            <div className="shrink-0">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground transition-colors hover:text-primary"
                {...ctaAttrs("explore-crm-sales", "crm-sales")}
              >
                CRM &amp; Sales <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 items-stretch lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — copy */}
          <div className="flex min-w-0 flex-col border-r border-border">
            <ul className="p-0 m-0 list-none">
              {highlights.map((h, i) => (
                <li
                  key={h.num}
                  onMouseEnter={() => setActive(i)}
                  className={`flex gap-4 p-8 border-b border-border transition-colors cursor-default ${
                    active === i ? "bg-muted/50" : ""
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-base font-semibold transition-colors ${
                      active === i ? "bg-primary text-white" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {h.num}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{h.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {h.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-auto grid grid-cols-2 items-center gap-0 border-b lg:border-b-0 lg:border-t border-border px-0 m-0">
              <button
                type="button"
                onClick={() => setActive((i) => (i - 1 + highlights.length) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none border-r border-border font-medium"
              >
                <ArrowLeft className="size-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setActive((i) => (i + 1) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none"
              >
                Next
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Right — illustrated CRM mockup */}
          <CRMSalesMockup active={active} />
        </div>
      </div>
    </section>
  );
}

function CRMSalesMockup({ active = 0 }: { active?: number }) {
  // Zone call-outs matching the left-hand... now right-hand numbered
  // highlights (01-04), same placeholder pattern as the other spotlights.
  const zoneRing = (zone: number) =>
    active === zone ? "ring-2 ring-inset ring-[#015941]" : "ring-2 ring-inset ring-transparent";

  const stats = [
    { label: "Open Leads", value: "128", sub: "+12 this week", icon: Users },
    { label: "Pipeline Value", value: "$84.2k", sub: "24 active deals", icon: BarChart3 },
    { label: "Win Rate", value: "38%", sub: "+4% vs last month", icon: TrendingUp },
    { label: "Avg. Deal Size", value: "$3,510", sub: "68 closed won", icon: Star },
  ];

  const stages = [
    {
      name: "New Lead",
      deals: [
        { name: "Horizon Textiles", value: "$2,400", dot: "#25D366" },
        { name: "Blue Harbor Co.", value: "$1,150", dot: "#38bdf8" },
        { name: "Nova Retail Group", value: "$3,800", dot: "#25D366" },
      ],
    },
    {
      name: "Qualified",
      deals: [
        { name: "Hilltop Logistics", value: "$5,200", dot: "#38bdf8" },
        { name: "Crestline Media", value: "$2,950", dot: "#38bdf8" },
        { name: "Dune Apparel", value: "$1,800", dot: "#f59e0b" },
      ],
    },
    {
      name: "Proposal Sent",
      deals: [
        { name: "Vertex Labs", value: "$7,400", dot: "#f59e0b" },
        { name: "Solace Interiors", value: "$2,100", dot: "#38bdf8" },
        { name: "Marbleton Foods", value: "$4,650", dot: "#25D366" },
      ],
    },
    {
      name: "Won",
      deals: [
        { name: "Echo Fitness", value: "$6,300", dot: "#015941" },
        { name: "Palmview Realty", value: "$9,100", dot: "#015941" },
        { name: "Juniper & Co.", value: "$3,250", dot: "#015941" },
      ],
    },
  ];

  const leads = [
    {
      name: "Horizon Textiles",
      contact: "Maria Chen",
      Icon: SiWhatsapp,
      color: "#25D366",
      tag: "New Lead",
    },
    {
      name: "Blue Harbor Co.",
      contact: "James Patel",
      Icon: Mail,
      color: "#64748B",
      tag: "Contacted",
    },
    {
      name: "Nova Retail Group",
      contact: "Elena Sousa",
      Icon: SiMessenger,
      color: "#0084FF",
      tag: "New Lead",
    },
    {
      name: "Hilltop Logistics",
      contact: "Omar Said",
      Icon: SiTelegram,
      color: "#2CA5E0",
      tag: "Qualified",
    },
  ];

  const team = [
    { name: "Alex Rivera", closed: "14 deals", value: "$32.4k" },
    { name: "Sarah Chen", closed: "11 deals", value: "$24.8k" },
    { name: "Marcus Lee", closed: "9 deals", value: "$18.1k" },
  ];

  return (
    <div className="relative min-w-0 overflow-x-clip">
      {/* BG Gradient */}
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-1/3 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-80 rounded-full bg-accent/10 blur-3xl" />
      </div> */}
      <div className="relative m-3 sm:m-8 xl:m-24">
        {/* Soft mint halo, centered behind the whole mockup */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-100/60 blur-3xl dark:bg-emerald-500/10"
        />

        {/* Small dot-grid clusters in opposite corners, echoing the reference */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 -top-8 -z-10 size-20"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1.5px, transparent 1.5px)",
            backgroundSize: "18px 18px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-8 -right-8 -z-10 size-24"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1.5px, transparent 1.5px)",
            backgroundSize: "18px 18px",
          }}
        />

        {/* Browser chrome */}
        <div className="rounded-control border border-border bg-muted/40 p-2 sm:p-4 xl:p-6">
          <div className="relative overflow-hidden rounded-control border border-border bg-background ">
            <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[11px] font-medium text-muted-foreground">
                <Brand> — CRM &amp; Sales</Brand>
              </span>
            </div>

            <div className="flex h-120">
              {/* Dark sidebar */}
              <div className="flex w-14 shrink-0 flex-col items-center gap-4 border-r border-border bg-[#0b1220] py-5">
                <span className="flex size-9 items-center justify-center rounded-control bg-whatsapp text-white">
                  <BarChart3 className="size-4.5" />
                </span>
                {[Inbox, MessageSquare, Users, Megaphone, Ticket, Workflow].map((Icon, i) => (
                  <span
                    key={i}
                    className="flex size-9 items-center justify-center rounded-control text-white/50"
                  >
                    <Icon className="size-4" />
                  </span>
                ))}
              </div>

              {/* Main content — the view swaps per selected highlight instead
                of just ringing a static Sales Pipeline page. */}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Header — title swaps with the selected highlight */}
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      {
                        [
                          "Leads & Contacts",
                          "Sales Pipeline",
                          "Customer Profile",
                          "Sales Insights",
                        ][active]
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {
                        [
                          "128 open leads",
                          "24 active deals · $84.2k total value",
                          "Complete activity & ownership",
                          "Team performance overview",
                        ][active]
                      }
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-control bg-whatsapp px-3 py-1.5 text-sm font-medium text-white">
                    <Plug className="size-3" /> New Deal
                  </span>
                </div>

                <div className="relative flex-1 overflow-hidden">
                  {/* 00 — Lead & Contact Management: leads list */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 0 ? 1 : 0,
                      transform: active === 0 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 0 ? "auto" : "none",
                    }}
                  >
                    <div className="space-y-2">
                      {leads.map((l) => (
                        <div
                          key={l.name}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-3"
                        >
                          <span
                            className="flex size-8 shrink-0 items-center justify-center rounded-control"
                            style={{ background: `${l.color}1a`, color: l.color }}
                          >
                            <l.Icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {l.name}
                            </p>
                            <p className="truncate text-xs  text-muted-foreground">{l.contact}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            {l.tag}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 01 — Sales Pipeline Visibility: kanban board */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 1 ? 1 : 0,
                      transform: active === 1 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 1 ? "auto" : "none",
                    }}
                  >
                    <div className="grid h-full grid-cols-4 gap-3">
                      {stages.map((stage) => (
                        <div
                          key={stage.name}
                          className="flex min-w-0 flex-col gap-2 rounded-control bg-muted/50 p-2.5"
                        >
                          <div className="flex items-center justify-between px-0.5">
                            <p className="truncate text-[11px] font-semibold uppercase text-muted-foreground">
                              {stage.name}
                            </p>
                            <span className="shrink-0 text-[9px] text-muted-foreground">
                              {stage.deals.length}
                            </span>
                          </div>
                          {stage.deals.map((d) => (
                            <div
                              key={d.name}
                              className="min-w-0 rounded-control border border-border bg-background p-2 transition-shadow hover:border-foreground/15 hover:shadow-md"
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="size-1.5 shrink-0 rounded-full"
                                  style={{ background: d.dot }}
                                />
                                <p className="truncate text-xs  font-medium text-foreground">
                                  {d.name}
                                </p>
                              </div>
                              <p className="mt-1 text-xs  font-semibold text-foreground">
                                {d.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 02 — Complete Customer Profiles: single contact detail */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 2 ? 1 : 0,
                      transform: active === 2 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 2 ? "auto" : "none",
                    }}
                  >
                    <div className="flex items-start gap-3 rounded-control border border-border bg-background p-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                        PS
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-foreground">Priya Sharma</p>
                        <p className="text-[11px] text-muted-foreground">Horizon Textiles</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[8.5px] font-medium text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            VIP
                          </span>
                          <span className="rounded-full border border-border px-2 py-0.5 text-[8.5px] text-muted-foreground">
                            Returning
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[12px] font-semibold text-foreground">$2,400</p>
                        <p className="text-[8.5px] text-muted-foreground">Open deal</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5 rounded-control border border-border bg-muted/50 p-3">
                      <p className="text-xs  font-semibold uppercase text-muted-foreground">
                        Recent activity
                      </p>
                      <p className="text-[11px] text-foreground">
                        "Is the order still available?" — via WhatsApp
                      </p>
                      <p className="text-[9px] text-muted-foreground">Owned by Alex Rivera</p>
                    </div>
                  </div>

                  {/* 03 — Sales Insights & Team Visibility: stats + rep leaderboard */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 3 ? 1 : 0,
                      transform: active === 3 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 3 ? "auto" : "none",
                    }}
                  >
                    <div className="grid grid-cols-4 gap-2.5">
                      {stats.map((s) => (
                        <div
                          key={s.label}
                          className="min-w-0 rounded-control border border-border bg-muted/50 p-2.5"
                        >
                          <span className="flex size-6 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            <s.icon className="size-3.5" />
                          </span>
                          <p className="mt-1.5 truncate text-[9px] text-muted-foreground">
                            {s.label}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">{s.value}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 px-0.5 text-xs  font-semibold uppercase text-muted-foreground">
                      Top performers
                    </p>
                    <div className="mt-2 space-y-2">
                      {team.map((m) => (
                        <div
                          key={m.name}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-2.5"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            {m.name
                              .split(" ")
                              .map((p) => p[0])
                              .join("")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-semibold text-foreground">
                              {m.name}
                            </p>
                            <p className="truncate text-[9px] text-muted-foreground">{m.closed}</p>
                          </div>
                          <span className="shrink-0 text-xs  font-semibold text-foreground">
                            {m.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating performance summary widget — bottom-center, overlapping the
          mockup's bottom edge like the reference, instead of off to one side —
          zone 3: Sales Insights & Team Visibility */}
        <div
          className={`animate-float absolute bottom-0 left-1/2 hidden w-56 -translate-x-1/4 translate-y-1/2 rounded-control border-0 bg-background p-5 shadow-xl transition-shadow duration-300 sm:block ${zoneRing(3)}`}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex size-14 shrink-0 items-center justify-center rounded-full"
              style={{ background: "conic-gradient(#015941 0 68%, #e2e8f0 68% 100%)" }}
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-background text-[11px] font-semibold text-primary">
                68%
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Win Rate</p>
              <p className="text-xs  text-muted-foreground">+6% from last quarter</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Automation & Bots spotlight — below CRM & Sales.              */
/* ============================================================ */
function AutomationBotsSpotlight() {
  const highlights = [
    {
      num: "01",
      title: "Visual Flow Builder",
      desc: "Design automated conversation journeys with an intuitive drag-and-drop workflow builder.",
    },
    {
      num: "02",
      title: "Intelligent Chatbots",
      desc: "Deliver instant, automated responses and guide customers through structured conversations.",
    },
    {
      num: "03",
      title: "Smart Triggers & Actions",
      desc: "Automatically initiate workflows based on incoming messages, conditions, and customer interactions.",
    },
    {
      num: "04",
      title: "Seamless Team Handoffs",
      desc: "Route conversations to the right team members when personal assistance is needed.",
    },
  ];

  // Hovering a highlight calls out the matching list row, mirroring the
  // Unified Omnichannel Inbox section's framed-box layout and interaction.
  const [active, setActive] = useState(0);

  return (
    <section className="relative section-marketing border-b border-border bg-surface">
      <div className="relative container-marketing p-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        {/* Header row — same 2-track template as the body grid below (no
            extra "auto" track) so the column divider lines up exactly. */}
        <div className="grid min-w-0 grid-cols-1 items-end gap-0 border-b border-border lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — title */}
          <div className="min-w-0 border-border px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-12 lg:border-r lg:py-12">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Automation &amp; Bots
            </span>
            <h2 className="text-marketing-title mt-5 leading-tight">
              Automate conversations.
              <br />
              Focus on what matters.
            </h2>
          </div>
          {/* Centre — lede */}
          <div className="flex min-w-0 flex-col items-start gap-6 px-5 pb-9 pt-5 sm:px-8 sm:pb-12 sm:pt-6 lg:flex-row lg:items-end lg:gap-8 lg:py-12">
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Build powerful workflows, automate customer interactions, and let intelligent chatbots
              handle repetitive conversations — all from one connected workspace.
            </p>
            {/* Right — text CTA */}
            <div className="shrink-0">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground transition-colors hover:text-primary"
                {...ctaAttrs("explore-automation-bots", "automation-bots")}
              >
                Automation &amp; Bots <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 items-stretch lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — copy */}
          <div className="flex min-w-0 flex-col border-r border-border">
            <ul className="p-0 m-0 list-none">
              {highlights.map((h, i) => (
                <li
                  key={h.num}
                  onMouseEnter={() => setActive(i)}
                  className={`flex gap-4 p-8 border-b border-border transition-colors cursor-default ${
                    active === i ? "bg-muted/50" : ""
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-base font-semibold transition-colors ${
                      active === i ? "bg-primary text-white" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {h.num}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{h.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {h.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-auto grid grid-cols-2 items-center gap-0 border-b lg:border-b-0 lg:border-t border-border px-0 m-0">
              <button
                type="button"
                onClick={() => setActive((i) => (i - 1 + highlights.length) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none border-r border-border font-medium"
              >
                <ArrowLeft className="size-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setActive((i) => (i + 1) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none"
              >
                Next
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Right — illustrated flow-builder mockup */}
          <AutomationBotsMockup active={active} />
        </div>
      </div>
    </section>
  );
}

function AutomationBotsMockup({ active = 0 }: { active?: number }) {
  // Zone call-outs matching the left-hand numbered highlights (01-04), same
  // placeholder pattern as the Unified Inbox mockup — hovering a highlight
  // rings the matching part of this mockup instead of doing nothing.
  const zoneRing = (zone: number) =>
    active === zone ? "ring-2 ring-inset ring-[#015941]" : "ring-2 ring-inset ring-transparent";

  const triggerNode = {
    icon: Zap,
    label: "Incoming Message",
    sub: "Trigger · Any channel",
    bg: "bg-emerald-50 text-primary dark:bg-emerald-500/15 dark:text-emerald-300",
  };
  const conditionNode = {
    icon: GitBranch,
    label: "Message Intent",
    sub: "Condition",
  };
  const branches = [
    {
      icon: Mail,
      label: "Automated Reply",
      sub: "Action",
      tag: "General inquiry",
      edge: "#015941",
      bg: "bg-emerald-50 text-primary dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    {
      icon: Bot,
      label: "Assign Conversation",
      sub: "Action",
      tag: "Needs a human",
      edge: "#0284c7",
      bg: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    },
    {
      icon: Clock,
      label: "Follow-Up",
      sub: "Action",
      tag: "No reply · 2h",
      edge: "#d97706",
      bg: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    },
  ];

  const stats = [
    { label: "Workflow Runs", value: "1,284", icon: Workflow },
    { label: "Completed Actions", value: "3,902", icon: Check },
    { label: "Active Flows", value: "26", icon: Zap },
    { label: "Team Handoffs", value: "142", icon: Users },
  ];

  return (
    <div className="relative min-w-0 overflow-x-clip">
      {/* BG Gradient */}
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-1/3 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-80 rounded-full bg-accent/10 blur-3xl" />
      </div> */}
      <div className="relative m-3 sm:m-8 xl:m-24">
        {/* Decorative dot-grid pattern behind the whole mockup */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-10 -z-10"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1.5px, transparent 1.5px)",
            backgroundSize: "10px 10px",
            maskImage: "radial-gradient(ellipse 75% 75% at 50% 50%, black 45%, transparent 85%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 75% 75% at 50% 50%, black 45%, transparent 85%)",
          }}
        />

        {/* Decorative mint blob behind the mockup */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-4 top-6 -z-10 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-500/10"
        />

        {/* Browser chrome */}
        <div className="rounded-control border border-border bg-muted/40 p-2 sm:p-4 xl:p-6">
          <div className="relative overflow-hidden rounded-control border border-border bg-background">
            <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[11px] font-medium text-muted-foreground">
                <Brand> — Visual Flow Builder</Brand>
              </span>
            </div>

            <div className="flex h-120">
              {/* Dark sidebar */}
              <div className="flex w-14 shrink-0 flex-col items-center gap-4 border-r border-border bg-[#0b1220] py-5">
                <span className="flex size-9 items-center justify-center rounded-control bg-whatsapp text-white">
                  <Workflow className="size-4.5" />
                </span>
                {[Inbox, MessageSquare, Users, Database, BarChart3, Blocks].map((Icon, i) => (
                  <span
                    key={i}
                    className="flex size-9 items-center justify-center rounded-control text-white/50"
                  >
                    <Icon className="size-4" />
                  </span>
                ))}
              </div>

              {/* Canvas */}
              <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Header / toolbar — title swaps with the selected highlight */}
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      {
                        [
                          "Customer Support Automation",
                          "WhatsApp Support Bot",
                          "Automation Rules",
                          "Team Routing",
                        ][active]
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {
                        [
                          "Active · Last run 2m ago",
                          "AI-powered · 94% resolution rate",
                          "4 active triggers",
                          "Auto-assign by skill",
                        ][active]
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
                      <Play className="size-3 fill-current" /> Test
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                      <span className="size-1.5 rounded-full bg-primary dark:bg-emerald-400" />
                      100% success
                    </span>
                  </div>
                </div>

                {/* Content area — the view actually swaps per selected
                  highlight instead of just ringing a static canvas. */}
                <div
                  className="relative flex-1 overflow-hidden"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }}
                >
                  {/* 00 — Visual Flow Builder: the node diagram */}
                  <div
                    className="absolute inset-0 flex items-center justify-center overflow-hidden p-6 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 0 ? 1 : 0,
                      transform: active === 0 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 0 ? "auto" : "none",
                    }}
                  >
                    <div className="relative h-90 w-130">
                      {/* Connector edges, drawn behind the nodes */}
                      <svg
                        aria-hidden
                        viewBox="0 0 520 360"
                        className="absolute inset-0 h-full w-full overflow-visible"
                      >
                        <path
                          d="M148,180 C185,180 195,180 202,180"
                          fill="none"
                          stroke="hsl(var(--border))"
                          strokeWidth="2"
                        />
                        <path
                          d="M258,180 C300,180 300,50 330,50"
                          fill="none"
                          stroke="#015941"
                          strokeWidth="2"
                        />
                        <path
                          d="M258,180 C300,180 300,180 330,180"
                          fill="none"
                          stroke="#0284c7"
                          strokeWidth="2"
                        />
                        <path
                          d="M258,180 C300,180 300,310 330,310"
                          fill="none"
                          stroke="#d97706"
                          strokeWidth="2"
                        />
                        {[
                          [148, 180],
                          [202, 180],
                          [258, 180],
                          [330, 50],
                          [330, 180],
                          [330, 310],
                        ].map(([cx, cy], i) => (
                          <circle
                            key={i}
                            cx={cx}
                            cy={cy}
                            r="3.5"
                            fill="var(--background)"
                            stroke="hsl(var(--border))"
                            strokeWidth="1.5"
                          />
                        ))}
                      </svg>

                      {/* Trigger node */}
                      <div
                        className="absolute w-37 -translate-y-1/2 rounded-control border-2 border-[#015941] bg-background p-3 shadow-md ring-4 ring-[#015941]/10"
                        style={{ left: 0, top: 180 }}
                      >
                        <div className="flex items-start justify-between">
                          <span
                            className={`flex size-8 items-center justify-center rounded-control ${triggerNode.bg}`}
                          >
                            <triggerNode.icon className="size-4" />
                          </span>
                          <MoreHorizontal className="size-3.5 text-muted-foreground/60" />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {triggerNode.label}
                        </p>
                        <p className="text-[9px] text-muted-foreground">{triggerNode.sub}</p>
                      </div>

                      {/* Condition diamond */}
                      <div
                        className="absolute flex size-14 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-control border border-border bg-muted/60 "
                        style={{ left: 230, top: 180 }}
                      >
                        <GitBranch className="size-5 -rotate-45 text-muted-foreground" />
                      </div>

                      {/* Branch action nodes */}
                      {branches.map((b, i) => (
                        <div
                          key={b.label}
                          className="absolute w-37.5 -translate-y-1/2 rounded-control border border-border bg-background p-3  transition-shadow hover:shadow-md"
                          style={{ left: 330, top: [50, 180, 310][i] }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex size-8 shrink-0 items-center justify-center rounded-control ${b.bg}`}
                            >
                              <b.icon className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {b.label}
                              </p>
                              <p className="text-[9px] text-muted-foreground">{b.sub}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Zoom controls, bottom-right of the canvas */}
                    <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-control border border-border bg-background p-1 ">
                      <span className="flex size-6 items-center justify-center rounded text-muted-foreground">
                        <Minus className="size-3.5" />
                      </span>
                      <span className="px-1 text-xs  font-medium text-muted-foreground">100%</span>
                      <span className="flex size-6 items-center justify-center rounded text-muted-foreground">
                        <Plus className="size-3.5" />
                      </span>
                      <span className="mx-0.5 h-4 w-px bg-border" />
                      <span className="flex size-6 items-center justify-center rounded text-muted-foreground">
                        <Maximize2 className="size-3" />
                      </span>
                    </div>
                  </div>

                  {/* 01 — Intelligent Chatbots: intents + live chat preview */}
                  <div
                    className="absolute inset-0 flex gap-4 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 1 ? 1 : 0,
                      transform: active === 1 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 1 ? "auto" : "none",
                    }}
                  >
                    <div className="w-36 shrink-0 space-y-2">
                      <p className="px-1 text-xs  font-semibold uppercase text-muted-foreground">
                        Intents
                      </p>
                      {[
                        { label: "Order Status", Icon: ShoppingCart, active: true },
                        { label: "Returns & Refunds", Icon: LifeBuoy },
                        { label: "Product Info", Icon: MessageCircle },
                        { label: "Human Handoff", Icon: Users },
                      ].map((it) => (
                        <div
                          key={it.label}
                          className={`flex items-center gap-2 rounded-control border px-2.5 py-2 text-[11px] font-medium ${
                            it.active
                              ? "border-[#015941] bg-emerald-50 text-primary dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "border-border bg-background text-muted-foreground"
                          }`}
                        >
                          <it.Icon className="size-3.5 shrink-0" />
                          <span className="truncate">{it.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-end gap-2 rounded-control border border-border bg-background p-4">
                      <div className="max-w-[85%] rounded-control rounded-tl-sm border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                        Hi, where is my order #4821?
                      </div>
                      <div className="ml-auto max-w-[85%] space-y-1.5 rounded-control rounded-tr-sm bg-primary px-3 py-2 text-sm text-white">
                        <p>It shipped this morning — tracking number 1Z9F8X2.</p>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[8.5px] font-medium">
                          Source: Order Status API
                        </span>
                      </div>
                      <div className="max-w-[85%] rounded-control rounded-tl-sm border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                        Perfect, thank you!
                      </div>
                    </div>
                  </div>

                  {/* 02 — Smart Triggers & Actions: rules table */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 2 ? 1 : 0,
                      transform: active === 2 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 2 ? "auto" : "none",
                    }}
                  >
                    <div className="space-y-2">
                      {[
                        {
                          Icon: Zap,
                          trigger: "New message received",
                          action: "Send welcome reply",
                          status: "Active",
                        },
                        {
                          Icon: Clock,
                          trigger: "No reply in 2 hours",
                          action: "Send follow-up",
                          status: "Active",
                        },
                        {
                          Icon: AtSign,
                          trigger: 'Customer mentions "refund"',
                          action: "Assign to Billing team",
                          status: "Active",
                        },
                        {
                          Icon: Star,
                          trigger: "Chat rating below 3",
                          action: "Notify manager",
                          status: "Paused",
                        },
                      ].map((r) => (
                        <div
                          key={r.trigger}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-3"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-emerald-50 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            <r.Icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              IF {r.trigger}
                            </p>
                            <p className="truncate text-xs  text-muted-foreground">
                              THEN {r.action}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                              r.status === "Active"
                                ? "bg-emerald-50 text-primary dark:bg-emerald-500/15 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 03 — Seamless Team Handoffs: routing + team load */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 3 ? 1 : 0,
                      transform: active === 3 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 3 ? "auto" : "none",
                    }}
                  >
                    <div className="mb-3 flex items-center gap-2 rounded-control border border-[#015941]/30 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-primary dark:bg-emerald-500/10 dark:text-emerald-300">
                      <Workflow className="size-4 shrink-0" />
                      Auto-assign by skill: Billing → Finance Team
                    </div>
                    <div className="space-y-2">
                      {[
                        { name: "Alex Rivera", bg: "#015941", load: "3 / 5 chats", online: true },
                        { name: "Sarah Chen", bg: "#0284c7", load: "2 / 5 chats", online: true },
                        { name: "Marcus Lee", bg: "#d97706", load: "5 / 5 chats", online: false },
                      ].map((m) => (
                        <div
                          key={m.name}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-3"
                        >
                          <span
                            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                            style={{ background: m.bg }}
                          >
                            {m.name
                              .split(" ")
                              .map((p) => p[0])
                              .join("")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {m.name}
                            </p>
                            <p className="truncate text-xs  text-muted-foreground">{m.load}</p>
                          </div>
                          <span
                            className={`size-2 shrink-0 rounded-full ${m.online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating chatbot preview widget — zone 1: Intelligent Chatbots */}
        <div
          className={`animate-float absolute -bottom-10 -right-6 hidden w-52 overflow-hidden rounded-control border-0 bg-background shadow-xl transition-shadow duration-300 sm:block ${zoneRing(1)}`}
        >
          <div className="flex items-center gap-2 bg-primary px-3 py-2.5 text-white">
            <span className="flex size-6 items-center justify-center rounded-full bg-white/15">
              <Bot className="size-3.5" />
            </span>
            <p className="text-sm font-semibold">Customer Support Bot</p>
          </div>
          <div className="space-y-2 p-3">
            <div className="max-w-[80%] rounded-control rounded-tl-sm border border-border bg-muted/40 px-2.5 py-1.5 text-xs  text-foreground">
              Hi! I need help with my order.
            </div>
            <div className="ml-auto max-w-[80%] rounded-control rounded-tr-sm bg-primary px-2.5 py-1.5 text-xs  text-white">
              Hello! How can I assist you today?
            </div>
            <div className="max-w-[80%] rounded-control rounded-tl-sm border border-border bg-muted/40 px-2.5 py-1.5 text-xs  text-foreground">
              I&apos;d like to check my order status.
            </div>
          </div>
        </div>

        {/* Floating workflow overview widget — zone 3: Seamless Team Handoffs */}
        <div
          className={`absolute -top-10 -left-10 hidden w-64 rounded-control border-0 bg-background p-4 shadow-xl transition-shadow duration-300 sm:block ${zoneRing(3)}`}
        >
          <p className="text-sm font-semibold text-foreground">Automation Overview</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                  <s.icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[9px] text-muted-foreground">{s.label}</p>
                  <p className="text-[11px] font-semibold text-foreground">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Marketing Campaigns spotlight — below Automation & Bots.      */
/* ============================================================ */
function MarketingCampaignsSpotlight() {
  const highlights = [
    {
      num: "01",
      title: "Campaign Management",
      desc: "Create, organize, and manage customer engagement campaigns from a centralized dashboard.",
    },
    {
      num: "02",
      title: "Audience Organization",
      desc: "Keep your target audiences and customer segments organized for more relevant communication.",
    },
    {
      num: "03",
      title: "Delivery Tracking",
      desc: "Stay informed with clear campaign statuses, message delivery updates, and progress visibility.",
    },
    {
      num: "04",
      title: "Campaign Insights",
      desc: "Understand messaging performance and identify opportunities to improve customer engagement.",
    },
  ];

  // Hovering a highlight calls out the matching zone of the mockup; column
  // order now matches the Unified Omnichannel Inbox section exactly (narrow
  // list left, wide mockup right) — only the alive background sets this
  // section apart.
  const [active, setActive] = useState(0);

  return (
    <section className="relative section-marketing border-b border-border bg-muted/50">
      <div className="relative container-marketing p-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        {/* Header row — same 2-track template as the body grid below (narrow
            track first, wide track second) so the divider lines up. */}
        <div className="grid min-w-0 grid-cols-1 items-end gap-0 border-b border-border lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — title */}
          <div className="min-w-0 border-border px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-12 lg:border-r lg:py-12">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Marketing Campaigns
            </span>
            <h2 className="text-marketing-title mt-5 leading-tight">
              Reach the right audience. Make every message count.
            </h2>
          </div>
          {/* Centre — lede */}
          <div className="flex min-w-0 flex-col items-start gap-6 px-5 pb-9 pt-5 sm:px-8 sm:pb-12 sm:pt-6 lg:flex-row lg:items-end lg:gap-8 lg:py-12">
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Plan, manage, and track customer messaging campaigns from one connected workspace.
              Keep your outreach organized and gain clearer visibility into campaign activity.
            </p>
            {/* Right — text CTA */}
            <div className="shrink-0">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground transition-colors hover:text-primary"
                {...ctaAttrs("explore-marketing-campaigns", "marketing-campaigns")}
              >
                Marketing Campaigns <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 items-stretch lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — copy */}
          <div className="flex min-w-0 flex-col border-r border-border">
            <ul className="p-0 m-0 list-none">
              {highlights.map((h, i) => (
                <li
                  key={h.num}
                  onMouseEnter={() => setActive(i)}
                  className={`flex gap-4 p-8 border-b border-border transition-colors cursor-default ${
                    active === i ? "bg-muted/50" : ""
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-base font-semibold transition-colors ${
                      active === i ? "bg-primary text-white" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {h.num}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{h.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {h.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-auto grid grid-cols-2 items-center gap-0 border-b lg:border-b-0 lg:border-t border-border px-0 m-0">
              <button
                type="button"
                onClick={() => setActive((i) => (i - 1 + highlights.length) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none border-r border-border font-medium"
              >
                <ArrowLeft className="size-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setActive((i) => (i + 1) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none"
              >
                Next
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Right — illustrated campaigns mockup */}
          <MarketingCampaignsMockup active={active} />
        </div>
      </div>
    </section>
  );
}

function MarketingCampaignsMockup({ active = 0 }: { active?: number }) {
  // Zone call-outs matching the right-hand numbered highlights (01-04), same
  // placeholder pattern as the other spotlights.
  const zoneRing = (zone: number) =>
    active === zone ? "ring-2 ring-inset ring-[#015941]" : "ring-2 ring-inset ring-transparent";

  const campaigns = [
    {
      name: "New Product Launch",
      Icon: SiWhatsapp,
      iconBg: "bg-emerald-50 text-[#25D366] dark:bg-emerald-500/15",
      audience: "2,480",
      status: "Sent",
      statusCls: "bg-emerald-50 text-primary dark:bg-emerald-500/15 dark:text-emerald-300",
      sent: "Oct 10, 2026",
    },
    {
      name: "Holiday Promotion",
      Icon: Mail,
      iconBg: "bg-sky-50 text-sky-600 dark:bg-sky-500/15",
      audience: "5,120",
      status: "Scheduled",
      statusCls: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
      sent: "Oct 14, 2026",
    },
    {
      name: "Abandoned Cart",
      Icon: SiWhatsapp,
      iconBg: "bg-emerald-50 text-[#25D366] dark:bg-emerald-500/15",
      audience: "1,860",
      status: "Draft",
      statusCls: "bg-muted text-muted-foreground",
      sent: "—",
    },
    {
      name: "Customer Updates",
      Icon: Mail,
      iconBg: "bg-sky-50 text-sky-600 dark:bg-sky-500/15",
      audience: "3,450",
      status: "Sent",
      statusCls: "bg-emerald-50 text-primary dark:bg-emerald-500/15 dark:text-emerald-300",
      sent: "Oct 5, 2026",
    },
    {
      name: "Re-engagement",
      Icon: SiTelegram,
      iconBg: "bg-sky-50 text-[#2CA5E0] dark:bg-sky-500/15",
      audience: "4,210",
      status: "Scheduled",
      statusCls: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
      sent: "Oct 16, 2026",
    },
  ];

  const channels = [
    { Icon: SiWhatsapp, pct: "42%", color: "#25D366" },
    { Icon: Mail, pct: "28%", color: "#64748B" },
    { Icon: SiMessenger, pct: "18%", color: "#0084FF" },
    { Icon: SiInstagram, pct: "12%", color: "#E1306C" },
  ];

  const segments = [
    { name: "VIP Customers", count: "1,240", desc: "Lifetime value above $500" },
    { name: "Recent Buyers", count: "3,680", desc: "Purchased in the last 30 days" },
    { name: "Cart Abandoners", count: "1,860", desc: "Left items in cart this week" },
    { name: "Newsletter Subscribers", count: "5,120", desc: "Opted in to email updates" },
  ];

  const delivery = [
    { name: "New Product Launch", sent: 2480, delivered: 2412, read: 1890 },
    { name: "Holiday Promotion", sent: 5120, delivered: 5080, read: 3640 },
    { name: "Customer Updates", sent: 3450, delivered: 3401, read: 2765 },
  ];

  return (
    <div className="relative min-w-0 overflow-x-clip">
      {/* BG Gradient */}
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-1/3 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-80 rounded-full bg-accent/10 blur-3xl" />
      </div> */}
      <div className="relative m-3 sm:m-8 xl:m-24">
        {/* Soft mint halo, centered behind the whole mockup */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-100/60 blur-3xl dark:bg-emerald-500/10"
        />

        {/* Small dot-grid clusters in opposite corners */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-8 -z-10 size-20"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1.5px, transparent 1.5px)",
            backgroundSize: "18px 18px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-8 -left-8 -z-10 size-24"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1.5px, transparent 1.5px)",
            backgroundSize: "18px 18px",
          }}
        />

        {/* Browser chrome */}
        <div className="rounded-control border border-border bg-muted/40 p-2 sm:p-4 xl:p-6">
          <div className="relative overflow-hidden rounded-control border border-border bg-background">
            <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[11px] font-medium text-muted-foreground">
                <Brand> — Marketing Campaigns</Brand>
              </span>
            </div>

            <div className="flex h-120">
              {/* Dark sidebar */}
              <div className="flex w-14 shrink-0 flex-col items-center gap-4 border-r border-border bg-[#0b1220] py-5">
                <span className="flex size-9 items-center justify-center rounded-control bg-whatsapp text-white">
                  <Megaphone className="size-4.5" />
                </span>
                {[Inbox, MessageSquare, Users, Workflow, Ticket, Database].map((Icon, i) => (
                  <span
                    key={i}
                    className="flex size-9 items-center justify-center rounded-control text-white/50"
                  >
                    <Icon className="size-4" />
                  </span>
                ))}
              </div>

              {/* Main content — the view swaps per selected highlight instead
                of just ringing a static Campaigns page. */}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Header — title swaps with the selected highlight */}
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      {
                        [
                          "Campaigns",
                          "Audience Segments",
                          "Delivery Tracking",
                          "Campaign Insights",
                        ][active]
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {
                        [
                          "5 active campaigns",
                          "4 segments organized",
                          "Real-time delivery status",
                          "Engagement & performance",
                        ][active]
                      }
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-control bg-whatsapp px-3 py-1.5 text-sm font-medium text-white">
                    <Plug className="size-3" /> Create Campaign
                  </span>
                </div>

                <div className="relative flex-1 overflow-hidden">
                  {/* 00 — Campaign Management: campaigns table */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 0 ? 1 : 0,
                      transform: active === 0 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 0 ? "auto" : "none",
                    }}
                  >
                    <div className="grid grid-cols-[minmax(4rem,1fr)_repeat(3,2.5rem)] gap-1 border-b border-border px-2 pb-2 text-[8px] font-semibold uppercase text-muted-foreground sm:grid-cols-[minmax(8rem,1fr)_repeat(3,72px)] sm:gap-2 sm:text-[9px]">
                      <span>Campaign</span>
                      <span>Audience</span>
                      <span>Status</span>
                      <span>Sent</span>
                    </div>
                    {campaigns.map((c) => (
                      <div
                        key={c.name}
                        className="grid grid-cols-[minmax(4rem,1fr)_repeat(3,2.5rem)] items-center gap-1 border-b border-border/60 px-2 py-2.5 sm:grid-cols-[minmax(8rem,1fr)_repeat(3,72px)] sm:gap-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`flex size-6 shrink-0 items-center justify-center rounded-control ${c.iconBg}`}
                          >
                            <c.Icon className="size-3.5" />
                          </span>
                          <p className="truncate text-[11px] font-medium text-foreground">
                            {c.name}
                          </p>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{c.audience}</span>
                        <span
                          className={`w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold ${c.statusCls}`}
                        >
                          {c.status}
                        </span>
                        <span className="truncate text-[9px] text-muted-foreground">{c.sent}</span>
                      </div>
                    ))}
                  </div>

                  {/* 01 — Audience Organization: segments list */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 1 ? 1 : 0,
                      transform: active === 1 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 1 ? "auto" : "none",
                    }}
                  >
                    <div className="space-y-2">
                      {segments.map((s) => (
                        <div
                          key={s.name}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-3"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            <Users className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {s.name}
                            </p>
                            <p className="truncate text-xs  text-muted-foreground">{s.desc}</p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-foreground">
                            {s.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 02 — Delivery Tracking: sent/delivered/read per campaign */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 2 ? 1 : 0,
                      transform: active === 2 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 2 ? "auto" : "none",
                    }}
                  >
                    <div className="space-y-3">
                      {delivery.map((d) => (
                        <div
                          key={d.name}
                          className="rounded-control border border-border bg-background p-3"
                        >
                          <p className="truncate text-sm font-semibold text-foreground">{d.name}</p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${(d.read / d.sent) * 100}%` }}
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[9px] text-muted-foreground">
                            <span>{d.sent.toLocaleString()} sent</span>
                            <span>{d.delivered.toLocaleString()} delivered</span>
                            <span className="font-medium text-primary dark:text-emerald-400">
                              {d.read.toLocaleString()} read
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 03 — Campaign Insights: channel mix */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 3 ? 1 : 0,
                      transform: active === 3 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 3 ? "auto" : "none",
                    }}
                  >
                    <p className="px-0.5 text-xs  font-semibold uppercase text-muted-foreground">
                      Channel mix
                    </p>
                    <div className="mt-2 space-y-2">
                      {channels.map((c) => (
                        <div
                          key={c.pct}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-2.5"
                        >
                          <span
                            className="flex size-7 shrink-0 items-center justify-center rounded-control text-white"
                            style={{ background: c.color }}
                          >
                            <c.Icon className="size-3.5" />
                          </span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{ width: c.pct, background: c.color }}
                            />
                          </div>
                          <span className="shrink-0 text-xs  font-semibold text-foreground">
                            {c.pct}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Floating channel distribution widget — zone 3: Campaign Insights */}
        <div
          className={`absolute -top-6 -right-6 hidden w-48 rounded-control border-0 bg-background p-4 shadow-xl transition-shadow duration-300 sm:block ${zoneRing(3)}`}
        >
          <p className="text-sm font-semibold text-foreground">Channel Distribution</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            {channels.map(({ Icon, pct, color }) => (
              <div key={pct} className="flex flex-col items-center gap-1.5">
                <span
                  className="flex size-8 items-center justify-center rounded-full text-white"
                  style={{ background: color }}
                >
                  <Icon className="size-4" />
                </span>
                <span className="text-[9px] font-semibold text-foreground">{pct}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Floating campaign performance widget — bottom-center, overlapping the
          mockup — zone 3: Campaign Insights */}
        <div
          className={`animate-float absolute bottom-0 left-1/2 hidden w-56 -translate-x-1/4 translate-y-1/2 rounded-control border-0 bg-background p-4 shadow-xl transition-shadow duration-300 sm:block ${zoneRing(3)}`}
        >
          <p className="text-sm font-semibold text-foreground">Campaign Performance</p>
          <p className="mt-0.5 text-xs  text-muted-foreground">Last 7 days</p>
          <svg viewBox="0 0 220 60" className="mt-2 h-14 w-full text-accent">
            <polyline
              points="0,45 35,38 70,42 105,22 140,28 175,10 220,15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Platform Ecosystem spotlight — below Marketing Campaigns.     */
/* ============================================================ */
function PlatformEcosystemSpotlight() {
  const brandName = useBrandName();
  const highlights = [
    {
      num: "01",
      title: "Unified Channel Connections",
      desc: "Connect WhatsApp, Messenger, Instagram, Telegram, and Email to manage customer conversations from one workspace.",
    },
    {
      num: "02",
      title: "Powerful API Access",
      desc: `Extend ${brandName} with configurable APIs and supported integrations to connect your existing business systems.`,
    },
    {
      num: "03",
      title: "Connected Workflows",
      desc: "Bring messaging, CRM, marketing, and automation together to create smoother customer journeys and more efficient operations.",
    },
    {
      num: "04",
      title: "Scalable Workspace Management",
      desc: "Organize teams, manage workspaces, and maintain control across multiple business operations from one platform.",
    },
  ];

  // Hovering a highlight calls out the matching list row, mirroring the
  // Unified Omnichannel Inbox section's framed-box layout and interaction.
  const [active, setActive] = useState(0);

  return (
    <section className="relative section-marketing border-b border-border bg-surface">
      <div className="relative container-marketing p-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        {/* Header row — same 2-track template as the body grid below (no
            extra "auto" track) so the column divider lines up exactly. */}
        <div className="grid min-w-0 grid-cols-1 items-end gap-0 border-b border-border lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — title */}
          <div className="min-w-0 border-border px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-12 lg:border-r lg:py-12">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Platform Ecosystem
            </span>
            <h2 className="text-marketing-title mt-5 leading-tight">
              Connect. Integrate.
              <br />
              Grow without limits.
            </h2>
          </div>
          {/* Centre — lede */}
          <div className="flex min-w-0 flex-col items-start gap-6 px-5 pb-9 pt-5 sm:px-8 sm:pb-12 sm:pt-6 lg:flex-row lg:items-end lg:gap-8 lg:py-12">
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Bring your communication channels, CRM, automation, and business workflows together.{" "}
              <Brand /> gives your team one connected platform to manage customer engagement and
              streamline operations.
            </p>
            {/* Right — text CTA */}
            <div className="shrink-0">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground transition-colors hover:text-primary"
                {...ctaAttrs("explore-platform-ecosystem", "platform-ecosystem")}
              >
                Platform Ecosystem <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 items-stretch lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — copy */}
          <div className="flex min-w-0 flex-col border-r border-border">
            <ul className="p-0 m-0 list-none">
              {highlights.map((h, i) => (
                <li
                  key={h.num}
                  onMouseEnter={() => setActive(i)}
                  className={`flex gap-4 p-8 border-b border-border transition-colors cursor-default ${
                    active === i ? "bg-muted/50" : ""
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-base font-semibold transition-colors ${
                      active === i ? "bg-primary text-white" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {h.num}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{h.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {h.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-auto grid grid-cols-2 items-center gap-0 border-b lg:border-b-0 lg:border-t border-border px-0 m-0">
              <button
                type="button"
                onClick={() => setActive((i) => (i - 1 + highlights.length) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none border-r border-border font-medium"
              >
                <ArrowLeft className="size-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setActive((i) => (i + 1) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none"
              >
                Next
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Right — illustrated integrations mockup */}
          <PlatformEcosystemMockup active={active} />
        </div>
      </div>
    </section>
  );
}

function PlatformEcosystemMockup({ active = 0 }: { active?: number }) {
  const brandName = useBrandName();
  // Zone call-outs matching the left-hand numbered highlights (01-04), same
  // placeholder pattern as the Unified Inbox mockup.
  const zoneRing = (zone: number) =>
    active === zone ? "ring-2 ring-inset ring-[#015941]" : "ring-2 ring-inset ring-transparent";

  const channels = [
    { Icon: SiWhatsapp, color: "#25D366" },
    { Icon: SiMessenger, color: "#0084FF" },
    { Icon: SiInstagram, color: "#E1306C" },
    { Icon: SiTelegram, color: "#2CA5E0" },
    { Icon: Mail, color: "#64748B" },
  ];

  // Only integrations this product actually ships are marked "Connected";
  // everything else (optional AI providers, payment gateways) is "Available"
  // and requires the workspace owner to configure it — never claimed as
  // already connected by default.
  const integrations = [
    {
      label: "WhatsApp",
      Icon: SiWhatsapp,
      tint: "bg-[#25D366]/10 text-[#25D366]",
      status: "Connected",
    },
    {
      label: "Messenger",
      Icon: SiMessenger,
      tint: "bg-[#0084FF]/10 text-[#0084FF]",
      status: "Connected",
    },
    {
      label: "Instagram",
      Icon: SiInstagram,
      tint: "bg-[#E1306C]/10 text-[#E1306C]",
      status: "Connected",
    },
    {
      label: "Telegram",
      Icon: SiTelegram,
      tint: "bg-[#2CA5E0]/10 text-[#2CA5E0]",
      status: "Connected",
    },
    { label: "Email", Icon: Mail, tint: "bg-slate-500/10 text-slate-500", status: "Connected" },
    { label: "OpenAI", mono: "O", monoBg: "#10A37F", status: "Available" },
    { label: "Gemini", mono: "G", monoBg: "#4285F4", status: "Available" },
    { label: "Anthropic", mono: "A", monoBg: "#D97757", status: "Available" },
    { label: "Groq", mono: "Gr", monoBg: "#0b1220", status: "Available" },
    { label: "Stripe", mono: "S", monoBg: "#635BFF", status: "Available" },
    { label: "Paddle", mono: "P", monoBg: "#1E3A2D", status: "Available" },
    { label: "Webhooks", Icon: Plug, tint: "bg-primary/10 text-primary", status: "Connected" },
  ];

  const overview = [
    { label: "Messaging Apps", value: 5, dot: "bg-emerald-500" },
    { label: "AI Providers", value: 4, dot: "bg-sky-500" },
    { label: "Payment Gateways", value: 2, dot: "bg-violet-500" },
    { label: "Webhooks", value: 1, dot: "bg-amber-500" },
  ];

  return (
    <div className="relative min-w-0 overflow-x-clip">
      {/* BG Gradient */}
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-1/3 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-80 rounded-full bg-accent/10 blur-3xl" />
      </div> */}
      <div className="relative m-3 sm:m-8 xl:m-24">
        {/* Channel bubbles with dashed connector lines down to the browser — zone 0: Unified Channel Connections */}
        {/* <div
        className={`relative z-10 mb-6 hidden items-center justify-center gap-6 rounded-full p-2 transition-shadow duration-300 sm:flex ${zoneRing(0)}`}
      >
        {channels.map(({ Icon, color }, i) => (
          <span
            key={i}
            className="flex size-7 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300 "
            style={{ color }}
          >
            <Icon className="size-5" />
          </span>
        ))}
      </div>
      <svg
        aria-hidden
        viewBox="0 0 400 48"
        className="pointer-events-none absolute -top-0 left-0 hidden h-12 w-full text-border sm:block"
        preserveAspectRatio="none"
      >
        {[36, 134, 200, 266, 364].map((x, i) => (
          <path
            key={i}
            d={`M${x},0 Q${x},24 200,24`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        ))}
        <circle cx="200" cy="24" r="3" className="fill-[#015941]" />
      </svg> */}

        {/* Soft mint halo, centered behind the whole mockup */}
        {/* <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-100/60 blur-3xl dark:bg-emerald-500/10"
      /> */}

        {/* Browser chrome */}
        <div className="rounded-control border border-border bg-muted/40 p-2 sm:p-4 xl:p-6">
          <div className="relative overflow-hidden rounded-control border border-border bg-background">
            <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[11px] font-medium text-muted-foreground">
                <Brand> — Platform Ecosystem</Brand>
              </span>
            </div>

            <div className="flex h-120">
              {/* Dark sidebar */}
              <div className="flex w-14 shrink-0 flex-col items-center gap-4 border-r border-border bg-[#0b1220] py-5">
                <span className="flex size-9 items-center justify-center rounded-control bg-whatsapp text-white">
                  <Plug className="size-4.5" />
                </span>
                {[Inbox, Users, Megaphone, Workflow, BarChart3].map((Icon, i) => (
                  <span
                    key={i}
                    className="flex size-9 items-center justify-center rounded-control text-white/50"
                  >
                    <Icon className="size-4" />
                  </span>
                ))}
              </div>

              {/* Main content — the view swaps per selected highlight instead
                of just ringing a static Integrations page. */}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Header — title swaps with the selected highlight */}
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      {
                        ["Channel Connections", "API & Webhooks", "Integrations", "Workspaces"][
                          active
                        ]
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {
                        [
                          "5 channels connected",
                          "2 active API keys · 1 webhook",
                          "Connect your favorite tools and services",
                          "3 workspaces · 12 team members",
                        ][active]
                      }
                    </p>
                  </div>
                </div>

                <div className="relative flex-1 overflow-hidden">
                  {/* 00 — Unified Channel Connections: per-channel status list */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 0 ? 1 : 0,
                      transform: active === 0 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 0 ? "auto" : "none",
                    }}
                  >
                    <div className="space-y-2">
                      {[
                        {
                          Icon: SiWhatsapp,
                          color: "#25D366",
                          label: "WhatsApp",
                          id: "+1 415 555 0132",
                        },
                        {
                          Icon: SiMessenger,
                          color: "#0084FF",
                          label: "Messenger",
                          id: `${brandName} Page`,
                        },
                        {
                          Icon: SiInstagram,
                          color: "#E1306C",
                          label: "Instagram",
                          id: `@${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
                        },
                        {
                          Icon: SiTelegram,
                          color: "#2CA5E0",
                          label: "Telegram",
                          id: `@${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "")}_bot`,
                        },
                        {
                          Icon: Mail,
                          color: "#64748B",
                          label: "Email",
                          id: `support@${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.app`,
                        },
                      ].map((c) => (
                        <div
                          key={c.label}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-3"
                        >
                          <span
                            className="flex size-8 shrink-0 items-center justify-center rounded-control"
                            style={{ background: `${c.color}1a`, color: c.color }}
                          >
                            <c.Icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {c.label}
                            </p>
                            <p className="truncate text-xs  text-muted-foreground">{c.id}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            Connected
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 01 — Powerful API Access: keys + webhook endpoints */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 1 ? 1 : 0,
                      transform: active === 1 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 1 ? "auto" : "none",
                    }}
                  >
                    <p className="px-1 text-xs  font-semibold uppercase text-muted-foreground">
                      API Keys
                    </p>
                    <div className="mt-2 flex items-center gap-3 rounded-control border border-border bg-background p-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                        <KeyRound className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          Production Key
                        </p>
                        <p className="truncate font-mono text-xs  text-muted-foreground">
                          wacrm_live_••••••••3f2a
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                        Active
                      </span>
                    </div>

                    <p className="mt-4 px-1 text-xs  font-semibold uppercase text-muted-foreground">
                      Webhook Endpoints
                    </p>
                    <div className="mt-2 flex items-center gap-3 rounded-control border border-border bg-background p-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
                        <Globe2 className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          conversation.created
                        </p>
                        <p className="truncate font-mono text-xs  text-muted-foreground">
                          https://yourapp.com/webhooks/wacrm
                        </p>
                      </div>
                      <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                    </div>
                  </div>

                  {/* 02 — Connected Workflows: integration cards */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 2 ? 1 : 0,
                      transform: active === 2 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 2 ? "auto" : "none",
                    }}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                        All Integrations
                      </span>
                      <span className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground">
                        Connected
                      </span>
                      <span className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground">
                        Available
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2.5">
                      {integrations.map((it) => (
                        <div
                          key={it.label}
                          className="rounded-control border border-border bg-background p-2.5"
                        >
                          {it.Icon ? (
                            <span
                              className={`flex size-7 items-center justify-center rounded-control ${it.tint}`}
                            >
                              <it.Icon className="size-3.5" />
                            </span>
                          ) : (
                            <span
                              className="flex size-7 items-center justify-center rounded-control text-[11px] font-semibold text-white"
                              style={{ background: it.monoBg }}
                            >
                              {it.mono}
                            </span>
                          )}
                          <p className="mt-1.5 truncate text-[11px] font-medium text-foreground">
                            {it.label}
                          </p>
                          <p
                            className={`text-[8.5px] font-medium ${it.status === "Connected" ? "text-primary dark:text-emerald-400" : "text-muted-foreground"}`}
                          >
                            {it.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 03 — Scalable Workspace Management: workspace list */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 3 ? 1 : 0,
                      transform: active === 3 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 3 ? "auto" : "none",
                    }}
                  >
                    <div className="space-y-2">
                      {[
                        { name: "Acme Business", plan: "Pro", members: 5 },
                        { name: "Tech Solutions", plan: "Business", members: 4 },
                        { name: "Green Mart", plan: "Starter", members: 3 },
                      ].map((w) => (
                        <div
                          key={w.name}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-3"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary/10 text-[11px] font-semibold text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            {w.name[0]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {w.name}
                            </p>
                            <p className="truncate text-xs  text-muted-foreground">
                              {w.plan} plan · {w.members} members
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            Active
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating API & Webhooks widget — zone 1: Powerful API Access */}
        <div
          className={`absolute -top-6 -right-6 hidden w-52 rounded-control border-0 bg-background p-4 shadow-xl transition-shadow duration-300 sm:block ${zoneRing(1)}`}
        >
          <p className="text-sm font-semibold text-foreground">API &amp; Webhooks</p>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                <Database className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs  font-medium text-foreground">REST API</p>
                <p className="truncate text-[8.5px] text-muted-foreground">
                  Build custom integrations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                <Plug className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs  font-medium text-foreground">Webhooks</p>
                <p className="truncate text-[8.5px] text-muted-foreground">
                  Real-time event notifications
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Floating connected-integrations overview — bottom-center, overlapping
          the mockup — zone 3: Scalable Workspace Management */}
        <div
          className={`animate-float absolute bottom-6 left-10 hidden w-60 -translate-x-1/4 translate-y-1/2 rounded-control border-0 bg-background p-4 shadow-xl transition-shadow duration-300 sm:block ${zoneRing(3)}`}
        >
          <p className="text-sm font-semibold text-foreground">Connected Integrations</p>
          <div className="mt-3 flex items-center gap-4">
            <div
              className="flex size-16 shrink-0 items-center justify-center rounded-full"
              style={{
                background:
                  "conic-gradient(#015941 0 42%, #0ea5e9 42% 75%, #8b5cf6 75% 92%, #f59e0b 92% 100%)",
              }}
            >
              <div className="flex size-11 flex-col items-center justify-center rounded-full bg-background text-center">
                <span className="text-[13px] font-semibold text-foreground">12</span>
                <span className="text-[6.5px] text-muted-foreground">Connected</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {overview.map((o) => (
                <div key={o.label} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`size-1.5 shrink-0 rounded-full ${o.dot}`} />
                    <span className="truncate text-[9px] text-muted-foreground">{o.label}</span>
                  </span>
                  <span className="shrink-0 text-[9px] font-semibold text-foreground">
                    {o.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Platform overview — premium bento grid tying every spotlight   */
/* section together into one "everything connected" close.       */
/* ============================================================ */
function PlatformOverviewBento() {
  return (
    <section className="section-marketing relative z-[38] overflow-hidden connected-platform-section bg-primary">
      <CornerPlus corner="bl" />
      <CornerPlus corner="br" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 65% 55% at 50% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 65% 55% at 50% 0%, black 0%, transparent 75%)",
        }}
      />

      <div className="relative container-marketing">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />
        <div className="row-bleed-marketing border-b border-white/15 pb-8">
          <div className="mx-auto max-w-2xl text-center ">
            <span className="chip-marketing-hero text-marketing-hero-eyebrow">
              <Sparkles className="size-3" /> Everything you need, connected
            </span>
            <h2 className="text-marketing-oninverse-title mt-5 leading-tight">
              One powerful platform.
              <br />
              Everything working together.
            </h2>
            <p className="text-marketing-oninverse-lede mt-4">
              From customer conversations to sales, marketing, and automation, <Brand /> brings your
              essential business tools into one connected workspace.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-0 border-y border-border bg-border row-bleed-marketing p-0">
          <div className="grid grid-cols-1 gap-px sm:grid-cols-6">
            {/* 01 — Omnichannel Inbox (large) */}
            <div className="group p-6 transition-colors duration-300 bg-muted/50 sm:col-span-3 lg:p-8">
              <span className="flex size-12 items-center justify-center rounded-control bg-primary/10 text-primary">
                <Inbox className="size-5" />
              </span>
              <h3 className="mt-5 font-display text-[16px] font-semibold leading-snug text-foreground  lg:text-[17px]">
                Omnichannel Inbox
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                Bring every conversation into one shared inbox — no more switching tabs.
              </p>

              {/* Channel badges — two rows scrolling in opposite directions */}
              <div
                className="relative mt-4 space-y-2 overflow-hidden"
                style={{
                  maskImage:
                    "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
                }}
              >
                <style>{`
                  @keyframes wacrm-ch-l { from { transform: translateX(0); } to { transform: translateX(-50%); } }
                  @keyframes wacrm-ch-r { from { transform: translateX(-50%); } to { transform: translateX(0); } }
                  .wacrm-ch-row-l { animation: wacrm-ch-l 16s linear infinite !important; animation-iteration-count: infinite !important; }
                  .wacrm-ch-row-r { animation: wacrm-ch-r 16s linear infinite !important; animation-iteration-count: infinite !important; }
                `}</style>
                {[
                  [
                    { name: "WhatsApp", Icon: SiWhatsapp, bg: "#25D366" },
                    { name: "Instagram", Icon: SiInstagram, bg: "#E1306C" },
                    { name: "Email", Icon: Mail, bg: "#64748B" },
                  ],
                  [
                    { name: "Messenger", Icon: SiMessenger, bg: "#0084FF" },
                    { name: "Telegram", Icon: SiTelegram, bg: "#26A5E4" },
                  ],
                ].map((row, i) => (
                  <div
                    key={i}
                    className={`flex w-max gap-2 ${i === 0 ? "wacrm-ch-row-l" : "wacrm-ch-row-r"}`}
                  >
                    {[...row, ...row, ...row, ...row].map((c, j) => (
                      <span
                        key={j}
                        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-card px-2 py-1.5 text-[11px] font-medium shadow-xs"
                      >
                        <span
                          className="flex size-4 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ background: c.bg }}
                        >
                          <c.Icon className="size-2.5" />
                        </span>
                        {c.name}
                      </span>
                    ))}
                  </div>
                ))}
              </div>

              {/* Mini product preview */}
              <div className="mt-5 rounded-control border border-border bg-card p-3">
                {[
                  {
                    name: "Priya Sharma",
                    snippet: "Is the order still available?",
                    Icon: SiWhatsapp,
                    bg: "#25D366",
                  },
                  {
                    name: "Daniel Cruz",
                    snippet: "Thanks for the quick reply!",
                    Icon: SiMessenger,
                    bg: "#0084FF",
                  },
                  {
                    name: "Amara Okafor",
                    snippet: "Can I get a discount code?",
                    Icon: SiInstagram,
                    bg: "#E1306C",
                  },
                ].map((c, i) => (
                  <div
                    key={c.name}
                    className={`flex items-center gap-2.5 rounded-control px-3 py-3 ${i === 0 ? "bg-muted/50 " : ""}`}
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: c.bg }}
                    >
                      <c.Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="truncate text-xs  text-muted-foreground">{c.snippet}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 02 — CRM & Sales (large) */}
            <div className="group p-6 transition-colors duration-300 bg-muted/50 sm:col-span-3 lg:p-8">
              <span className="flex size-12 items-center justify-center rounded-control bg-primary/10 text-primary">
                <BarChart3 className="size-5" />
              </span>
              <h3 className="mt-5 font-display text-[16px] font-semibold leading-snug text-foreground  lg:text-[17px]">
                CRM &amp; Sales
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                Keep every lead, contact, and deal organized with full relationship context.
              </p>

              {/* CRM entity badges — two rows scrolling in opposite directions */}
              <div
                className="relative mt-4 space-y-2 overflow-hidden"
                style={{
                  maskImage:
                    "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
                }}
              >
                <style>{`
                  @keyframes wacrm-ch-l { from { transform: translateX(0); } to { transform: translateX(-50%); } }
                  @keyframes wacrm-ch-r { from { transform: translateX(-50%); } to { transform: translateX(0); } }
                  .wacrm-ch-row-l { animation: wacrm-ch-l 16s linear infinite !important; animation-iteration-count: infinite !important; }
                  .wacrm-ch-row-r { animation: wacrm-ch-r 16s linear infinite !important; animation-iteration-count: infinite !important; }
                `}</style>
                {[
                  [
                    { name: "Leads", Icon: UserPlus },
                    { name: "Deals", Icon: TrendingUp },
                  ],
                  [
                    { name: "Contacts", Icon: Users },
                    { name: "Pipeline", Icon: GitBranch },
                  ],
                ].map((row, i) => (
                  <div
                    key={i}
                    className={`flex w-max gap-2 ${i === 0 ? "wacrm-ch-row-l" : "wacrm-ch-row-r"}`}
                  >
                    {[...row, ...row, ...row, ...row].map((c, j) => (
                      <span
                        key={j}
                        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-card px-2 py-1.5 text-[11px] font-medium shadow-xs"
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <c.Icon className="size-2.5" />
                        </span>
                        {c.name}
                      </span>
                    ))}
                  </div>
                ))}
              </div>

              {/* Mini product preview */}
              <div className="mt-5 grid grid-cols-3 gap-2.5">
                {[
                  { name: "New Lead", deal: "Horizon Textiles", value: "$2,400", dot: "#25D366" },
                  { name: "Qualified", deal: "Hilltop Logistics", value: "$5,200", dot: "#38bdf8" },
                  { name: "Won", deal: "Echo Fitness", value: "$6,300", dot: "#015941" },
                  { name: "Qualified", deal: "Hilltop Logistics", value: "$5,200", dot: "#38bdf8" },
                  { name: "Won", deal: "Echo Fitness", value: "$6,300", dot: "#015941" },
                  { name: "New Lead", deal: "Horizon Textiles", value: "$2,400", dot: "#25D366" },
                ].map((stage, index) => (
                  <div
                    key={`${stage.name}-${index}`}
                    className="rounded-control bg-muted p-4 border border-border"
                  >
                    <p className="text-[11px] font-semibold uppercase">{stage.name}</p>
                    <div className="mt-2 rounded-control border border-border bg-muted/50 p-2 ">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: stage.dot }}
                        />
                        <p className="truncate text-[11px] font-medium text-muted-foreground">
                          {stage.deal}
                        </p>
                      </div>
                      <p className="mt-2 font-semibold">{stage.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 03 — Marketing Campaigns (medium) */}
            <div className="group bg-card p-6 transition-colors duration-300 hover:bg-muted/50 sm:col-span-2">
              <span className="flex size-12 items-center justify-center rounded-control bg-primary/10 text-primary">
                <Megaphone className="size-4.5" />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold leading-snug text-foreground ">
                Marketing Campaigns
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Manage targeted messaging campaigns, organize audiences, and track activity.
              </p>
            </div>

            {/* 04 — Chatbots & Automation (medium) */}
            <div className="group bg-card p-6 transition-colors duration-300 hover:bg-muted/50 sm:col-span-2">
              <span className="flex size-12 items-center justify-center rounded-control bg-primary/10 text-primary">
                <Bot className="size-4.5" />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold leading-snug text-foreground ">
                Chatbots &amp; Automation
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Automate repetitive conversations and configure intelligent responses.
              </p>
            </div>

            {/* 05 — Visual Flow Builder (medium) */}
            <div className="group bg-card p-6 transition-colors duration-300 hover:bg-muted/50 sm:col-span-2">
              <span className="flex size-12 items-center justify-center rounded-control bg-primary/10 text-primary">
                <Workflow className="size-4.5" />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold leading-snug text-foreground ">
                Visual Flow Builder
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Design connected automation journeys with triggers, conditions, and actions.
              </p>
            </div>

            {[
              {
                num: "06",
                icon: Users,
                title: "Team Collaboration",
                desc: "Assign conversations, manage ownership, and keep your team working together.",
              },
              {
                num: "07",
                icon: BarChart3,
                title: "Insights & Analytics",
                desc: "Monitor conversations, team activity, and performance through clear dashboards.",
              },
              {
                num: "08",
                icon: KeyRound,
                title: "Workspaces & API Access",
                desc: "Manage multiple workspaces and extend your platform with API connections.",
              },
            ].map((f) => (
              <div
                key={f.num}
                className="group bg-card p-6 transition-colors duration-300 hover:bg-muted/50 sm:col-span-2"
              >
                <span className="flex size-12 items-center justify-center rounded-control bg-primary/10 text-primary">
                  <f.icon className="size-4.5" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold leading-snug text-foreground ">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}

            {[
              {
                num: "09",
                icon: Send,
                title: "Bulk Broadcasting",
                desc: "Send personalized WhatsApp and SMS campaigns to thousands of contacts with smart throttling.",
              },
              {
                num: "10",
                icon: TrendingUp,
                title: "Lead Generation",
                desc: "Capture and qualify leads automatically, score them, and never let a hot lead slip away.",
              },
              {
                num: "11",
                icon: ShoppingCart,
                title: "E-commerce Sync",
                desc: "Connect your store to sync orders, send cart reminders, and confirm deliveries over chat.",
              },
              {
                num: "12",
                icon: CalendarClock,
                title: "Social Scheduling",
                desc: "Plan and publish posts across your social accounts from one content calendar.",
              },
              {
                num: "13",
                icon: Ticket,
                title: "Helpdesk & Ticketing",
                desc: "Turn conversations into tickets, set priorities, and resolve customer issues with SLAs.",
              },
              {
                num: "14",
                icon: Clock,
                title: "Appointment Booking",
                desc: "Let customers book, reschedule, and get reminders for appointments over chat.",
              },
            ].map((f) => (
              <div
                key={f.num}
                className="group bg-card p-6 transition-colors duration-300 hover:bg-muted/50 sm:col-span-2"
              >
                <span className="flex size-12 items-center justify-center rounded-control bg-primary/10 text-primary">
                  <f.icon className="size-4.5" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold leading-snug text-foreground ">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center gap-6 text-center">
          <p className="text-marketing-hero-meta max-w-xl">
            Less switching. Better collaboration. More connected customer experiences.
          </p>
          <Button asChild variant="heroGhost" size="xl">
            <Link to="/features" {...ctaAttrs("explore-all-features", "platform-overview")}>
              Explore All Features <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Multi-tenant & workspace management                           */
/* ============================================================ */
function WorkspaceManagementSpotlight() {
  const highlights = [
    {
      num: "01",
      title: "Multi-Tenant Architecture",
      desc: "Manage multiple organizations and workspaces through a structured, scalable SaaS platform.",
    },
    {
      num: "02",
      title: "Team & Role Management",
      desc: "Invite team members, assign roles, and manage access to keep collaboration organized.",
    },
    {
      num: "03",
      title: "Workspace Configuration",
      desc: "Configure workspace settings, connected communication channels, and team preferences.",
    },
    {
      num: "04",
      title: "Centralized Administration",
      desc: "Maintain visibility and control over workspace operations, team management, and platform configurations.",
    },
  ];

  // Hovering a highlight calls out the matching zone of the mockup; column
  // order now matches the Unified Omnichannel Inbox section exactly (narrow
  // list left, wide mockup right) — only the alive background sets this
  // section apart.
  const [active, setActive] = useState(0);

  return (
    <section className="relative section-marketing border-b border-border bg-muted/50">
      <div className="relative container-marketing p-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        {/* Header row — same 2-track template as the body grid below (narrow
            track first, wide track second) so the divider lines up. */}
        <div className="grid min-w-0 grid-cols-1 items-end gap-0 border-b border-border lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — title */}
          <div className="min-w-0 border-border px-5 pb-5 pt-9 sm:px-8 sm:pb-6 sm:pt-12 lg:border-r lg:py-12">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Multi-Tenant &amp; Workspace Management
            </span>
            <h2 className="text-marketing-title mt-5 leading-tight">
              Multiple workspaces.
              <br />
              One powerful platform.
            </h2>
          </div>
          {/* Centre — lede */}
          <div className="flex min-w-0 flex-col items-start gap-6 px-5 pb-9 pt-5 sm:px-8 sm:pb-12 sm:pt-6 lg:flex-row lg:items-end lg:gap-8 lg:py-12">
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Organize your businesses, manage teams, and control workspace operations from one
              connected platform. Keep customer conversations, team access, and business settings
              organized as you grow.
            </p>
            {/* Right — text CTA */}
            <div className="shrink-0">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground transition-colors hover:text-primary"
                {...ctaAttrs("explore-workspace-management", "workspace-management")}
              >
                Workspace Management <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 items-stretch lg:grid-cols-[0.85fr_1.4fr]">
          {/* Left — copy */}
          <div className="flex min-w-0 flex-col border-r border-border">
            <ul className="p-0 m-0 list-none">
              {highlights.map((h, i) => (
                <li
                  key={h.num}
                  onMouseEnter={() => setActive(i)}
                  className={`flex gap-4 p-8 border-b border-border transition-colors cursor-default ${
                    active === i ? "bg-muted/50" : ""
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-base font-semibold transition-colors ${
                      active === i ? "bg-primary text-white" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {h.num}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">{h.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {h.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-auto grid grid-cols-2 items-center gap-0 border-b lg:border-b-0 lg:border-t border-border px-0 m-0">
              <button
                type="button"
                onClick={() => setActive((i) => (i - 1 + highlights.length) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none border-r border-border font-medium"
              >
                <ArrowLeft className="size-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setActive((i) => (i + 1) % highlights.length)}
                className="p-6 flex items-center justify-center gap-2 hover:bg-muted/80 transition-colors rounded-none"
              >
                Next
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>

          {/* Right — illustrated workspace management mockup */}
          <WorkspaceManagementMockup active={active} />
        </div>
      </div>
    </section>
  );
}

function WorkspaceManagementMockup({ active = 0 }: { active?: number }) {
  const brandName = useBrandName();
  const brandDomain = `${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "platform"}.com`;
  // Zone call-outs matching the right-hand numbered highlights (01-04), same
  // placeholder pattern as the other spotlights.
  const zoneRing = (zone: number) =>
    active === zone ? "ring-2 ring-inset ring-[#015941]" : "ring-2 ring-inset ring-transparent";

  const roles = [
    { label: "Super Admin", tint: "bg-[#0b1220] text-white" },
    { label: "Workspace Admin", tint: "bg-sky-500 text-white" },
    { label: "Team Member", tint: "bg-amber-500 text-white" },
    { label: "Support Agent", tint: "bg-rose-500 text-white" },
  ];

  const workspaces = [
    { name: "Acme Business", domain: `acme.${brandDomain}`, plan: "Pro", members: 3 },
    { name: "Tech Solutions", domain: `tech.${brandDomain}`, plan: "Business", members: 5 },
    { name: "Green Mart", domain: `green.${brandDomain}`, plan: "Starter", members: 2 },
    { name: "Smart Agency", domain: `agency.${brandDomain}`, plan: "Business", members: 4 },
  ];

  const stats = [
    { label: "Total Workspaces", value: "5", Icon: Layers },
    { label: "Team Members", value: "28", Icon: Users },
    { label: "Connected Channels", value: "5", Icon: Globe2 },
  ];

  const team = [
    { name: "John Smith", email: "john@acme.com", role: "Admin" },
    { name: "Sarah Johnson", email: "sarah@acme.com", role: "Manager" },
    { name: "Michael Chen", email: "michael@acme.com", role: "Agent" },
  ];

  const settingsCategories = [
    { label: "General Settings", desc: "Workspace name, domain, business details", Icon: Layers },
    { label: "Branding & Appearance", desc: "Logo, colors, and customization", Icon: Globe2 },
    { label: "Connected Channels", desc: "Manage communication channels", Icon: Plug },
    { label: "Billing & Plan", desc: "Subscription, invoices, and usage", Icon: BarChart3 },
  ];

  const activity = [
    { text: "New workspace created: Smart Agency", time: "2h ago" },
    { text: "John Smith promoted to Admin", time: "6h ago" },
    { text: "Workspace plan upgraded: Tech Solutions", time: "1d ago" },
  ];

  return (
    <div className="relative min-w-0 overflow-x-clip">
      {/* BG Gradient */}
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-1/3 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-80 rounded-full bg-accent/10 blur-3xl" />
      </div> */}
      <div className="relative m-3 sm:m-8 xl:m-24">
        {/* Role avatars with dashed connector lines down to the browser */}
        {/* <div className="relative z-10 mb-6 hidden items-center justify-center gap-8 sm:flex">
        {roles.map((r) => (
          <span key={r.label} className="flex flex-col items-center gap-1.5">
            <span
              className={`flex size-10 items-center justify-center rounded-full text-[11px] font-semibold  ${r.tint}`}
            >
              {r.label
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </span>
            <span className="text-xs  font-medium text-muted-foreground">{r.label}</span>
          </span>
        ))}
      </div>
      <svg
        aria-hidden
        viewBox="0 0 400 40"
        className="pointer-events-none absolute -top-2 left-0 hidden h-10 w-full text-border sm:block"
        preserveAspectRatio="none"
      >
        {[50, 150, 250, 350].map((x, i) => (
          <path
            key={i}
            d={`M${x},0 Q${x},20 200,20`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        ))}
        <circle cx="200" cy="20" r="3" className="fill-[#015941]" />
      </svg> */}

        {/* Soft mint halo, centered behind the whole mockup */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-100/60 blur-3xl dark:bg-emerald-500/10"
        />

        {/* Floating Switch Workspace widget — zone 0: Multi-Tenant Architecture */}
        <div
          className={`absolute -top-6 -right-6 hidden w-52 rounded-control border-0 bg-background p-4 shadow-xl transition-shadow duration-300 sm:block z-10 ${zoneRing(0)}`}
        >
          <p className="text-sm font-semibold text-foreground">Switch Workspace</p>
          <div className="mt-3 space-y-2">
            {workspaces.slice(0, 3).map((w, i) => (
              <div key={w.name} className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-control bg-primary/10 text-[9px] font-semibold text-primary">
                  {w.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs  font-medium text-foreground">{w.name}</p>
                  <p className="truncate text-[8.5px] text-muted-foreground">{w.domain}</p>
                </div>
                {i === 0 && <Check className="size-3.5 shrink-0 text-primary" />}
              </div>
            ))}
          </div>
        </div>

        {/* Browser chrome */}
        <div className="rounded-control border border-border bg-muted/40 p-2 sm:p-4 xl:p-6">
          <div className="relative overflow-hidden rounded-control border border-border bg-background">
            <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[11px] font-medium text-muted-foreground">
                <Brand> — Workspace Management</Brand>
              </span>
            </div>

            <div className="flex h-120">
              {/* Dark sidebar */}
              <div className="flex w-14 shrink-0 flex-col items-center gap-4 border-r border-border bg-[#0b1220] py-5">
                <span className="flex size-9 items-center justify-center rounded-control bg-whatsapp text-white">
                  <Blocks className="size-4.5" />
                </span>
                {[Inbox, Users, Megaphone, Bot, BarChart3, Settings].map((Icon, i) => (
                  <span
                    key={i}
                    className="flex size-9 items-center justify-center rounded-control text-white/50"
                  >
                    <Icon className="size-4" />
                  </span>
                ))}
              </div>

              {/* Main content — the view swaps per selected highlight instead
                of just ringing a static Workspaces page. */}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Header — title swaps with the selected highlight */}
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      {
                        ["Workspaces", "Team Members", "Workspace Settings", "Admin Overview"][
                          active
                        ]
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {
                        [
                          "5 workspaces managed",
                          "28 members across workspaces",
                          "Configure branding & channels",
                          "Platform-wide visibility",
                        ][active]
                      }
                    </p>
                  </div>
                  <span className="flex items-center gap-1 rounded-control bg-primary px-2.5 py-1.5 text-xs  font-medium text-white">
                    <Plus className="size-3" /> Create Workspace
                  </span>
                </div>

                <div className="relative flex-1 overflow-hidden">
                  {/* 00 — Multi-Tenant Architecture: workspace table */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 0 ? 1 : 0,
                      transform: active === 0 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 0 ? "auto" : "none",
                    }}
                  >
                    <div className="overflow-hidden rounded-control border border-border">
                      <div className="grid grid-cols-[1.3fr_0.7fr_0.6fr_0.6fr] bg-muted/40 px-3 py-2 text-[8.5px] font-semibold uppercase text-muted-foreground">
                        <span>Workspace</span>
                        <span>Plan</span>
                        <span>Members</span>
                        <span>Status</span>
                      </div>
                      {workspaces.map((w) => (
                        <div
                          key={w.name}
                          className="grid grid-cols-[1.3fr_0.7fr_0.6fr_0.6fr] items-center border-t border-border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs  font-medium text-foreground">
                              {w.name}
                            </p>
                            <p className="truncate text-[8px] text-muted-foreground">{w.domain}</p>
                          </div>
                          <span className="text-[8.5px] text-muted-foreground">{w.plan}</span>
                          <span className="text-[8.5px] text-muted-foreground">{w.members}</span>
                          <span className="w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-medium text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            Active
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 01 — Team & Role Management: team list */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 1 ? 1 : 0,
                      transform: active === 1 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 1 ? "auto" : "none",
                    }}
                  >
                    <div className="space-y-2">
                      {team.map((m) => (
                        <div
                          key={m.name}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-3"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            {m.name[0]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {m.name}
                            </p>
                            <p className="truncate text-xs  text-muted-foreground">{m.email}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                            {m.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 02 — Workspace Configuration: settings categories */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 2 ? 1 : 0,
                      transform: active === 2 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 2 ? "auto" : "none",
                    }}
                  >
                    <div className="space-y-2">
                      {settingsCategories.map((s) => (
                        <div
                          key={s.label}
                          className="flex items-center gap-3 rounded-control border border-border bg-background p-3"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            <s.Icon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {s.label}
                            </p>
                            <p className="truncate text-xs  text-muted-foreground">{s.desc}</p>
                          </div>
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 03 — Centralized Administration: stats + activity log */}
                  <div
                    className="absolute inset-0 overflow-hidden p-5 transition-all duration-500 ease-out"
                    style={{
                      opacity: active === 3 ? 1 : 0,
                      transform: active === 3 ? "scale(1)" : "scale(1.02)",
                      pointerEvents: active === 3 ? "auto" : "none",
                    }}
                  >
                    <div className="grid grid-cols-3 gap-2.5">
                      {stats.map((s) => (
                        <div
                          key={s.label}
                          className="rounded-control border border-border bg-muted/50 p-2.5"
                        >
                          <span className="flex size-6 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                            <s.Icon className="size-3.5" />
                          </span>
                          <p className="mt-1.5 text-base font-semibold text-foreground">
                            {s.value}
                          </p>
                          <p className="truncate text-[8.5px] text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 px-0.5 text-xs  font-semibold uppercase text-muted-foreground">
                      Recent activity
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {activity.map((a) => (
                        <div
                          key={a.text}
                          className="flex items-center justify-between gap-2 rounded-control border border-border bg-background p-2.5"
                        >
                          <span className="truncate text-xs  text-foreground">{a.text}</span>
                          <span className="shrink-0 text-[8.5px] text-muted-foreground">
                            {a.time}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Team Members widget — bottom-left, overlapping the mockup —
          zone 1: Team & Role Management */}
        <div
          className={`absolute -bottom-6 -left-6 hidden w-56 rounded-control border-0 bg-background p-4 shadow-xl transition-shadow duration-300 sm:block ${zoneRing(1)}`}
        >
          <p className="text-sm font-semibold text-foreground">Team Members</p>
          <div className="mt-3 space-y-2.5">
            {team.map((m) => (
              <div key={m.name} className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs  font-semibold text-primary">
                  {m.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs  font-medium text-foreground">{m.name}</p>
                  <p className="truncate text-[8.5px] text-muted-foreground">{m.email}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Workspace Settings widget — bottom-right, overlapping the
          mockup — zone 2: Workspace Configuration */}
        <div
          className={`animate-float absolute bottom-0 right-0 hidden w-52 translate-y-1/3 rounded-control border-0 bg-background p-4 shadow-xl transition-shadow duration-300 lg:block ${zoneRing(2)}`}
        >
          <p className="text-sm font-semibold text-foreground">Workspace Settings</p>
          <div className="mt-3 space-y-2.5">
            {[
              { label: "General Settings", desc: "Name, domain, business details", Icon: Layers },
              { label: "Connected Channels", desc: "Manage communication channels", Icon: Globe2 },
              { label: "Team & Permissions", desc: "Invite members and set roles", Icon: Users },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary dark:bg-emerald-500/15 dark:text-emerald-300">
                  <s.Icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs  font-medium text-foreground">{s.label}</p>
                  <p className="truncate text-[8.5px] text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Stepper — auto-rotating feature tabs with image + list + CTA */
/* ============================================================ */
const STEP_SLUGS = [
  "step-smart-inbox",
  "step-flow-builder",
  "step-campaigns-webhooks",
  "step-automation-chatbots",
  "step-ecommerce-shopify",
] as const;

const STEP_INDICATOR_POSITIONS = [
  "left-0 min-[45rem]:left-[0%]",
  "left-[9rem] min-[45rem]:left-[20%]",
  "left-[18rem] min-[45rem]:left-[40%]",
  "left-[27rem] min-[45rem]:left-[60%]",
  "left-[36rem] min-[45rem]:left-[80%]",
] as const;

function Stepper() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

  const steps = [
    {
      n: "01",
      title: "Smart Inbox",
      desc: "One live queue for every channel — WhatsApp, Instagram, Messenger, Telegram, SMS, Email and Live Chat. Assign, tag, and resolve conversations together.",
      list: [
        "Unified inbox with real-time presence",
        "Auto-assignment, mentions, and SLA timers",
        "Internal notes and collision detection",
        "Mobile notifications for urgent threads",
      ],
      cta: "Explore the inbox",
      href: "#features",
      image: stepperInboxImg,
      alt: "Smart Inbox shared team queue",
    },
    {
      n: "02",
      title: "Flow Builder",
      desc: "Drag triggers, conditions, delays and AI steps into a visual journey with versioning, test runs, and one-click publishing.",
      list: [
        "No-code canvas with 30+ node types",
        "Branching logic, A/B splits and loops",
        "Version history and rollback",
        "Trigger from webhooks, schedules or events",
      ],
      cta: "See flow builder",
      href: "#workflow",
      image: stepperFlowImg,
      alt: "visual flow builder canvas",
    },
    {
      n: "03",
      title: "Campaigns & Webhooks",
      desc: "Broadcast approved templates to live segments, then push events to any external system or BI tool.",
      list: [
        "Segment by tags, behavior, or CRM status",
        "WhatsApp template approval pipeline",
        "Real-time analytics and read receipts",
        "Webhooks to Zapier, Make, custom APIs",
      ],
      cta: "View campaigns",
      href: "#pricing",
      image: stepperCampaignImg,
      alt: "campaign analytics dashboard",
    },
    {
      n: "04",
      title: "Automation Flows & Chatbots",
      desc: "Deploy AI agents grounded in your knowledge base that hand off cleanly to a human when confidence is low.",
      list: [
        "Knowledge base with RAG and citations",
        "Multi-language intent detection",
        "Skills-based routing and human handoff",
        "Live train from closed conversations",
      ],
      cta: "Meet the AI",
      href: "#workflow",
      image: stepperBotImg,
      alt: "AI chatbot builder",
    },
    {
      n: "05",
      title: "Ecommerce Integration",
      desc: "Connect your Shopify store and turn WhatsApp into a checkout channel. Sync products, carts, orders and abandoned-cart recovery.",
      list: [
        "Native Shopify store sync and catalog import",
        "WhatsApp product cards and mini-cart checkout",
        "Abandoned-cart and order-status automations",
        "Unified customer profile across store and chat",
      ],
      cta: "Explore commerce",
      href: "#features",
      image: stepperEcommerceImg,
      alt: "ecommerce and Shopify WhatsApp integration",
    },
  ];

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((i) => (i + 1) % steps.length), 5000);
    return () => clearInterval(id);
  }, [paused, steps.length]);

  // Keep the selected tab visible when the compact tab list scrolls horizontally.
  useEffect(() => {
    const tabList = tabListRef.current;
    const tab = tabList?.querySelector<HTMLButtonElement>(`[data-step-index="${active}"]`);
    if (!tabList || !tab) return;

    tabList.scrollTo({
      behavior: "smooth",
      left: tab.offsetLeft - (tabList.clientWidth - tab.offsetWidth) / 2,
    });
  }, [active]);

  // Deep links: #step-flow-builder etc. selects the tab and scrolls it into view.
  useEffect(() => {
    const applyHash = (scroll: boolean) => {
      const slug = window.location.hash.replace(/^#/, "");
      const idx = STEP_SLUGS.indexOf(slug as (typeof STEP_SLUGS)[number]);
      if (idx < 0) return;
      setActive(idx);
      setPaused(true);
      if (scroll) {
        requestAnimationFrame(() => {
          sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    };
    applyHash(true);
    const onHashChange = () => applyHash(true);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const selectStep = (i: number) => {
    setActive(i);
    setPaused(true);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${STEP_SLUGS[i]}`);
    }
  };

  return (
    <section
      ref={sectionRef}
      id="workflow"
      className="section-marketing scroll-mt-24 border-b border-border bg-background"
    >
      <div className="relative container-marketing">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
            The workflow
          </span>
          <h2 className="text-marketing-title mt-4">
            From first message to fully automated revenue.
          </h2>
        </div>

        <div
          className="mt-6 rounded-0 border-t border-border bg-surface shadow-elegant overflow-hidden row-bleed-marketing p-0"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {/* Tab list — Saaly-style segmented bar: equal-width cells, divided by
              a vertical border, active tab marked by bold text + thin underline
              instead of a filled pill. */}
          <div ref={tabListRef} className="overflow-x-auto border-b border-border bg-background">
            <div
              className="relative grid min-w-[45rem] divide-x divide-border min-[45rem]:min-w-full"
              style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(9rem, 1fr))` }}
              role="tablist"
            >
              {steps.map((s, i) => {
                const isActive = i === active;
                return (
                  <button
                    key={s.n}
                    id={STEP_SLUGS[i]}
                    data-step-index={i}
                    onClick={() => selectStep(i)}
                    role="tab"
                    aria-selected={isActive}
                    className={`relative min-w-0 scroll-mt-24 px-3 py-4 text-center text-xs leading-tight transition-colors duration-200 rounded-none sm:px-6 sm:py-6 sm:text-sm ${
                      isActive
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    {s.title}
                  </button>
                );
              })}
              {/* Active-tab indicator — jumps to the active tab's slot (left/width
                transition), then its fill animates left-to-right in sync with
                the real 5s auto-advance timer, pausing on hover/focus/select
                instead of snapping, and restarting from empty on each tab. */}
              <span
                aria-hidden
                className={`absolute bottom-0 h-0.75 w-36 overflow-hidden bg-foreground/5 transition-[left,width] duration-300 ease-out min-[45rem]:w-1/5 ${STEP_INDICATOR_POSITIONS[active]}`}
              >
                <span
                  key={active}
                  className="block h-full w-full origin-left bg-primary"
                  style={{
                    animation: "stepper-progress 5000ms linear forwards",
                    animationPlayState: paused ? "paused" : "running",
                  }}
                />
              </span>
            </div>
          </div>

          {/* Content panels */}
          <div className="relative">
            {steps.map((s, i) => (
              <div
                key={s.n}
                className={`transition-opacity duration-500 ease-out ${i === active ? "relative opacity-100 z-10" : "absolute inset-0 opacity-0 z-0 pointer-events-none"}`}
                aria-hidden={i !== active}
              >
                <div className="grid gap-8 px-6 pt-6 lg:grid-cols-2 lg:gap-12 lg:pt-10 lg:px-10">
                  {/* Text */}
                  <div className="flex flex-col justify-center">
                    <h3 className="text-marketing-title mt-4">{s.title}</h3>
                    <p className="text-marketing-lede mt-3">{s.desc}</p>
                    <ul className="mt-6 space-y-3">
                      {s.list.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-marketing-meta">
                          <Check className="mt-0.5 size-4 shrink-0 text-whatsapp" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-8">
                      {/* Text CTA */}
                      <div className="shrink-0">
                        <a
                          href={s.href}
                          {...ctaAttrs("stepper_cta", "workflow", "cta_click", s.title)}
                          className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground transition-colors hover:text-primary"
                        >
                          {s.cta} <ArrowRight className="ml-2 size-4" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Image */}
                  <div className="relative overflow-hidden rounded-control border border-border bg-muted/50 p-6">
                    <img
                      src={s.image}
                      alt={s.alt}
                      loading="lazy"
                      className="inset-0 h-full w-full object-cover rounded-control border border-border"
                      style={{ filter: "hue-rotate(110deg)" }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Roles — bento                                                */
/* ============================================================ */
function Roles() {
  const roles = [
    {
      num: "02",
      icon: Users,
      t: "Admin",
      d: "Workspace, billing, members, integrations.",
      scope: "Workspace operations",
    },
    {
      num: "03",
      icon: BarChart3,
      t: "Manager",
      d: "Pipelines, campaigns, workflows, teams.",
      scope: "Performance & teams",
    },
    {
      num: "04",
      icon: MessagesSquare,
      t: "Agent",
      d: "Inbox, tickets, contacts, deals in scope.",
      scope: "Conversations & support",
    },
    {
      num: "05",
      icon: Headphones,
      t: "Provider",
      d: "Bookings, service delivery, client tasks.",
      scope: "Bookings & delivery",
    },
  ];

  return (
    <section className="section-marketing relative border-b border-border bg-muted/50">
      <div className="relative container-marketing p-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        <div className="border-b border-border px-8 py-12 text-center lg:px-12 lg:py-16">
          <div className="mx-auto max-w-3xl">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Multi-role System
            </span>
            <h2 className="text-marketing-title mt-4">
              One platform. Seven purpose-built experiences.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] font-normal leading-[1.75] text-muted-foreground sm:text-base">
              Give every teammate a focused workspace with the right tools, context, and level of
              access — from platform administration to customer-facing work.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-12">
          {/* 01 — Super Admin, the primary platform control surface */}
          <div className="relative flex min-h-[360px] flex-col justify-between overflow-hidden bg-primary p-8 text-hero-foreground sm:col-span-2 lg:col-span-6 lg:row-span-2 lg:p-10">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
                maskImage: "radial-gradient(ellipse 70% 60% at 100% 0%, black 0%, transparent 70%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 70% 60% at 100% 0%, black 0%, transparent 70%)",
              }}
            />
            <div
              aria-hidden
              className="absolute -bottom-24 -right-20 size-72 rounded-full border border-white/10"
            />
            <div
              aria-hidden
              className="absolute -bottom-10 -right-8 size-44 rounded-full border border-white/10"
            />

            <div className="relative">
              <div className="flex items-start justify-between gap-6">
                <span className="flex size-12 items-center justify-center rounded-control border border-white/15 bg-white/10 backdrop-blur-sm">
                  <ShieldCheck className="size-6" />
                </span>
                <span className="font-display text-xs font-semibold  text-white/70">01 / 07</span>
              </div>
              <p className="mt-8 text-[11px] font-semibold uppercase text-white/60">
                Platform control plane
              </p>
              <h3 className="mt-2 font-display text-[clamp(1.5rem,2vw,2rem)] font-semibold leading-none text-white">
                Super Admin
              </h3>
              <p className="mt-4 max-w-md text-[14px] leading-[1.7] text-white/70">
                Tenant management, quotas, feature flags, audit logs, platform-wide announcements
                and white-label config.
              </p>
            </div>
            <div className="relative mt-8 flex flex-wrap gap-2">
              {["Tenants", "Quotas", "Feature flags", "Audit logs", "White-label"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-hero-foreground-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {roles.map((r) => (
            <div
              key={r.t}
              className="group relative flex min-h-[180px] flex-col bg-background p-6 transition-colors duration-300 hover:bg-muted/50 dark:hover:bg-emerald-500/5 lg:col-span-3"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-primary/8 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              />
              <div className="relative flex items-start justify-between gap-4">
                <span className="flex size-12 items-center justify-center rounded-control bg-primary/8 text-primary dark:text-emerald-300">
                  <r.icon className="size-4.5" />
                </span>
                <span className="font-display text-[12px] font-semibold text-muted-foreground">
                  {r.num} / 07
                </span>
              </div>
              <h3 className="relative mt-5 font-display text-base font-semibold text-foreground">
                {r.t}
              </h3>
              <p className="relative mt-2 text-[13px] text-muted-foreground">{r.d}</p>
              <p className="relative mt-auto border-t border-border pt-4 text-[11px] font-semibold uppercase text-primary dark:text-emerald-400">
                {r.scope}
              </p>
            </div>
          ))}

          {/* 06 — Client Portal */}
          <div className="group relative overflow-hidden bg-background p-8 transition-colors duration-300 hover:bg-muted/50 dark:hover:bg-emerald-500/5 sm:col-span-2 lg:col-span-6 lg:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <span className="flex size-12 items-center justify-center rounded-control bg-primary/8 text-primary dark:text-emerald-300">
                  <Globe2 className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-base font-semibold text-foreground">
                  Client Portal
                </h3>
                <p className="mt-2 max-w-md text-[13.5px] text-muted-foreground">
                  Conversations, invoices, quotes and files — presented in a workspace branded to
                  your organization.
                </p>
              </div>
              <span className="shrink-0 whitespace-nowrap font-display text-[12px] font-semibold text-muted-foreground">
                06 / 07
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Branded portal", "Invoices & quotes", "File sharing"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 07 — Developer */}
          <div className="group relative overflow-hidden bg-background p-7 transition-colors duration-300 hover:bg-muted/50 dark:hover:bg-emerald-500/5 sm:col-span-2 lg:col-span-6 lg:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <span className="flex size-12 items-center justify-center rounded-control bg-primary/8 text-primary dark:text-emerald-300">
                  <Plug className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-base font-semibold leading-tight text-foreground">
                  Developer
                </h3>
                <p className="mt-2 text-sm leading-[1.65] text-muted-foreground">
                  API keys, webhooks, event streams and custom integrations.
                </p>
              </div>
              <span className="shrink-0 whitespace-nowrap font-display text-[12px] font-semibold text-muted-foreground">
                07 / 07
              </span>
            </div>
            <div className="mt-6 flex items-center gap-2 rounded-control border border-border bg-muted/40 px-3 py-2.5 font-mono text-[12px] font-semibold text-muted-foreground">
              <span className="text-primary dark:text-emerald-400">POST</span>
              <span className="truncate">/v1/webhooks/conversation.created</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Security                                                     */
/* ============================================================ */
function Security() {
  const brandName = useBrandName();
  const items: Array<{
    icon: LucideIcon;
    title: string;
    description: string;
    tag: string;
  }> = [
    {
      icon: Layers,
      title: "Tenant-safe access",
      description:
        "Workspace roles and auth.uid() policies keep each organization's records isolated at the database boundary.",
      tag: "Scoped RLS",
    },
    {
      icon: KeyRound,
      title: "Identity & session controls",
      description:
        "TOTP, trusted-device checks, revocable sessions, and login history keep access accountable.",
      tag: "TOTP + sessions",
    },
    {
      icon: Database,
      title: "Privacy by design",
      description:
        "Consent records, portable exports, retention rules, and erasure workflows support privacy operations.",
      tag: "Export · Retain · Erase",
    },
    {
      icon: ShieldCheck,
      title: "Signed event delivery",
      description:
        "HMAC-SHA256 signatures, rotating secrets, and delivery logs protect outbound webhook traffic.",
      tag: "HMAC-SHA256",
    },
    {
      icon: Server,
      title: "Infrastructure you control",
      description: `Run ${brandName} on Docker, a VPS, or your own cloud and keep customer data inside your environment.`,
      tag: "Self-hosted",
    },
  ];

  const [activeItem, setActiveItem] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setActiveItem((current) => (current + 1) % items.length),
      4200,
    );
    return () => window.clearInterval(timer);
  }, [items.length, paused]);

  return (
    <section
      id="security"
      className="section-marketing relative scroll-mt-24 border-b border-border bg-surface"
    >
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-40 size-[34rem] rounded-full bg-[#25D366]/8 blur-3xl" />
        <div
          className="absolute right-0 top-0 h-80 w-1/2 opacity-45"
          style={{
            backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "linear-gradient(to left, black, transparent)",
            WebkitMaskImage: "linear-gradient(to left, black, transparent)",
          }}
        />
      </div> */}

      <div className="container-marketing relative">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        <div className="max-w-3xl">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
            Security by design
          </span>
          <h2 className="text-marketing-title mt-4">
            Enterprise controls baked into the schema, not bolted on.
          </h2>
          <p className="text-marketing-lede mt-4">
            Workspace-scoped RLS, dedicated role tables, and audited security functions make access
            explicit across every tenant—without recursive policies or privilege escalation.
          </p>
        </div>

        <div
          className="row-bleed-marketing mt-12 grid overflow-hidden border-y border-border bg-background p-0 lg:grid-cols-[1fr_1fr]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
          }}
        >
          <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden border-b border-border bg-[#f4faf6] dark:bg-emerald-950/20 lg:min-h-[515px] lg:border-b-0 lg:border-r">
            <div
              aria-hidden
              className="absolute inset-0 opacity-45"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(1,89,65,0.18) 1px, transparent 1px)",
                backgroundSize: "10px 10px",
                maskImage: "radial-gradient(circle at center, black, transparent 68%)",
                WebkitMaskImage: "radial-gradient(circle at center, black, transparent 68%)",
              }}
            />
            <div aria-hidden className="absolute size-72 rounded-full border border-[#015941]/10" />
            <div aria-hidden className="absolute size-52 rounded-full border border-[#015941]/15" />
            <div aria-hidden className="absolute size-36 rounded-full bg-background shadow-xl" />

            {items.map((item, index) => {
              const Icon = item.icon;
              const isActive = index === activeItem;
              return (
                <div
                  key={item.title}
                  aria-hidden={!isActive}
                  className={`absolute z-10 flex flex-col items-center transition-all duration-500 ease-out ${
                    isActive ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"
                  }`}
                >
                  <Icon
                    className="size-20 text-primary dark:text-emerald-300 sm:size-24"
                    strokeWidth={1.15}
                  />
                </div>
              );
            })}

            <div className="absolute left-6 top-6 flex items-center gap-2 text-[11px] font-semibold uppercase  text-primary dark:text-emerald-300 sm:left-8 sm:top-8">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#25D366] opacity-50" />
                <span className="relative inline-flex size-2 rounded-full bg-[#25D366]" />
              </span>
              Security architecture
            </div>

            <div className="absolute inset-x-6 bottom-6 flex items-center justify-between gap-4 border-t border-[#015941]/15 pt-4 sm:inset-x-8 sm:bottom-8">
              <div>
                <p className="text-[11px] font-medium uppercase text-muted-foreground">
                  Active control
                </p>
                <p className="mt-1 font-mono text-xs font-semibold text-foreground">
                  {items[activeItem].tag}
                </p>
              </div>
              <span className="font-mono text-[12px] font-semibold text-muted-foreground">
                {String(activeItem + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="divide-y divide-border">
            {items.map((item, index) => {
              const Icon = item.icon;
              const isActive = index === activeItem;
              return (
                <button
                  key={item.title}
                  type="button"
                  aria-expanded={isActive}
                  onClick={() => setActiveItem(index)}
                  onMouseEnter={() => setActiveItem(index)}
                  onFocus={() => setActiveItem(index)}
                  className={`group relative block w-full overflow-hidden px-6 py-6 text-left transition-colors duration-300 sm:px-8 sm:py-6 rounded-none ${
                    isActive ? "bg-muted/50 dark:bg-emerald-950/15" : "hover:bg-muted/50"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-0.75 bg-primary transition-opacity duration-300 dark:bg-emerald-400 ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <span className="flex items-center gap-4">
                    <span
                      className={`flex size-12 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
                        isActive
                          ? "border-[#015941]/20 bg-primary text-white dark:border-emerald-400/30 dark:bg-emerald-400 dark:text-emerald-950"
                          : "border-border bg-background text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-4" strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-4">
                        <span className="font-display text-base font-semibold text-foreground sm:text-base">
                          {item.title}
                        </span>
                        <span className="font-mono text-[12px] font-semibold text-muted-foreground">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </span>
                      <span
                        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                          isActive
                            ? "mt-2.5 grid-rows-[1fr] opacity-100"
                            : "mt-0 grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <span className="overflow-hidden pr-5 text-[12.5px] leading-relaxed text-muted-foreground sm:text-[13px]">
                          {item.description}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            {["Database-enforced access", "Auditable events", "Owner-controlled data"].map(
              (label) => (
                <span key={label} className="inline-flex items-center gap-2">
                  <Check className="size-3.5 text-primary dark:text-emerald-400" />
                  {label}
                </span>
              ),
            )}
          </div>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full shrink-0 self-start sm:w-auto sm:self-auto"
          >
            <a
              href={docsUrl()}
              target="_blank"
              rel="noreferrer"
              {...ctaAttrs("security-guide", "security")}
            >
              Read the security guide <ArrowRight />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Integrations                                                 */
/* ============================================================ */
function Integrations() {
  const GroqLogo = ({ className = "" }: { className?: string }) => (
    <span className={`${className} flex items-center justify-center font-black leading-none`}>
      G
    </span>
  );

  const groups = [
    {
      icon: MessagesSquare,
      number: "01",
      title: "Communication channels",
      description: "Bring every supported customer touchpoint into one shared workspace.",
      items: [
        "WhatsApp Cloud API",
        "Instagram DM",
        "Messenger",
        "Telegram",
        "SMS",
        "Email",
        "Live Chat",
      ],
    },
    {
      icon: Bot,
      number: "02",
      title: "AI providers",
      description: "Choose the intelligence layer that best fits each assistant and workflow.",
      items: ["Gemini", "OpenAI", "Anthropic", "Groq"],
    },
    {
      icon: Workflow,
      number: "03",
      title: "Business systems",
      description: "Connect payments, scheduling, and event-driven business operations.",
      items: ["Stripe", "Paddle", "Google Calendar", "Webhooks", "REST API"],
    },
  ];

  const channelProviders = {
    "WhatsApp Cloud API": { Icon: SiWhatsapp, color: "#25D366" },
    "Instagram DM": { Icon: SiInstagram, color: "#E1306C" },
    Messenger: { Icon: SiMessenger, color: "#0084FF" },
    Telegram: { Icon: SiTelegram, color: "#26A5E4" },
    SMS: { Icon: MessageSquare, color: "#F97316" },
    Email: { Icon: Mail, color: "#64748B" },
    "Live Chat": { Icon: Headphones, color: "#0D9488" },
  } as const;

  const brandProviders = {
    Gemini: { Icon: SiGooglegemini, color: "#4285F4" },
    OpenAI: { Icon: BsOpenai, color: "#111827" },
    Anthropic: { Icon: SiAnthropic, color: "#D97757" },
    Groq: { Icon: GroqLogo, color: "#F55036" },
    Stripe: { Icon: SiStripe, color: "#635BFF" },
    Paddle: { Icon: SiPaddle, color: "#0B3B2E" },
    "Google Calendar": { Icon: SiGooglecalendar, color: "#4285F4" },
  } as const;

  return (
    <section className="section-marketing relative border-b border-border bg-muted/50">
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse 55% 65% at 0% 100%, black 0%, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 55% 65% at 0% 100%, black 0%, transparent 72%)",
          }}
        />
        <div className="absolute -right-32 top-12 size-96 rounded-full bg-[#25D366]/8 blur-3xl" />
      </div> */}

      <div className="relative container-marketing p-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        <div className="grid border-b border-border lg:grid-cols-[0.9fr_1.1fr]">
          {/* Editorial copy */}
          <div className="flex flex-col justify-center px-8 py-14 lg:min-h-[540px] lg:px-12 lg:py-16">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary w-fit ">
              Connect your stack
            </span>
            <h2 className="text-marketing-title mt-4">
              Plug into everything your business already runs on.
            </h2>
            <p className="mt-6 max-w-lg text-[15px] leading-[1.75] text-muted-foreground">
              Connect customer channels, AI providers, payments, and operational tools while keeping
              customer context inside one unified workspace.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild variant="secondary" size="lg" className="w-full sm:w-fit">
                <a
                  href={docsUrl()}
                  target="_blank"
                  rel="noreferrer"
                  {...ctaAttrs("browse-the-api", "integrations")}
                >
                  Explore integrations <ArrowRight className="size-4" />
                </a>
              </Button>
              <span className="inline-flex items-center gap-2 px-2 text-base text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#25D366] opacity-50" />
                  <span className="relative inline-flex size-2 rounded-full bg-[#25D366]" />
                </span>
                Configurable from one workspace
              </span>
            </div>

            <div className="mt-10 grid max-w-lg grid-cols-3 border-y border-border">
              {[
                ["07", "Channels"],
                ["04", "AI providers"],
                ["API", "Extensible"],
              ].map(([value, label], index) => (
                <div
                  key={label}
                  className={`py-4 ${index > 0 ? "border-l border-border pl-5" : "px-5"}`}
                >
                  <p className="font-display text-xl font-semibold text-foreground">{value}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Connection map */}
          <div className="relative min-h-[500px] overflow-hidden border-t border-border bg-background lg:min-h-[540px] lg:border-l lg:border-t-0">
            <ConnectionMap />
          </div>
        </div>

        {/* Compact verified directory */}
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-3">
          {groups.map((group) => (
            <div
              key={group.title}
              className="group relative overflow-hidden bg-background p-6 transition-colors duration-300 hover:bg-muted/50 lg:p-7"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-control bg-primary/8 text-primary dark:text-emerald-300">
                    <group.icon className="size-4" />
                  </span>
                  <span>
                    <span className="block font-display text-[14px] font-semibold text-foreground">
                      {group.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] uppercase text-muted-foreground">
                      {group.items.length} connections
                    </span>
                  </span>
                </span>
                <span className="font-display text-[12px] font-semibold text-muted-foreground">
                  {group.number}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 flex-wrap gap-2">
                {group.items.map((item) => {
                  const provider =
                    group.number === "01"
                      ? channelProviders[item as keyof typeof channelProviders]
                      : undefined;
                  const brand =
                    group.number !== "01"
                      ? brandProviders[item as keyof typeof brandProviders]
                      : undefined;
                  const ProviderIcon = provider?.Icon ?? brand?.Icon;
                  const providerColor = provider?.color ?? brand?.color;

                  return (
                    <span
                      key={item}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/35 py-1.5 pl-1.5 pr-2.5 text-xs font-medium text-foreground"
                    >
                      {ProviderIcon ? (
                        <span
                          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-card shadow-sm"
                          style={{ color: providerColor }}
                        >
                          <ProviderIcon className="size-3" />
                        </span>
                      ) : (
                        <span className="ml-1 size-1.5 rounded-full bg-[#25D366] truncate" />
                      )}
                      {item}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-5 border-t border-border bg-background px-8 py-7 sm:flex-row sm:items-center sm:justify-between lg:px-12">
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-foreground text-background">
              <Blocks className="size-4.5" />
            </span>
            <div>
              <p className="font-display text-base font-semibold text-foreground">
                Need a custom connection?
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Extend <Brand /> with REST APIs, signed webhooks, and configurable event flows.
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 text-[11px] font-semibold uppercase text-primary dark:text-emerald-400">
            Developer-ready <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* CTA                                                          */
/* ============================================================ */
function CTA() {
  const brandName = useBrandName();
  const proof = [
    {
      n: "01",
      title: "Use-case walkthrough",
      text: "A focused 20-minute session built around your team's workflow.",
    },
    {
      n: "02",
      title: "Migration path",
      text: `A practical route from your current inbox or CRM into ${brandName}.`,
    },
    {
      n: "03",
      title: "Channel onboarding",
      text: "Numbers, templates, verification, and workspace setup covered.",
    },
    {
      n: "04",
      title: "Deployment review",
      text: "Choose managed infrastructure or review self-hosting with your engineers.",
    },
  ];
  return (
    <section
      id="demo"
      className="section-marketing relative scroll-mt-24 border-b border-border bg-background p-0"
    >
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 size-[30rem] rounded-full bg-[#25D366]/7 blur-3xl" />
        <div className="absolute -right-40 bottom-0 size-[32rem] rounded-full bg-primary/7 blur-3xl" />
      </div> */}

      <div className="container-marketing relative py-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        <div className="row-bleed-marketing relative overflow-hidden border-y border-white/10 bg-primary p-0 text-white shadow-[0_32px_90px_-54px_rgba(1,89,65,0.75)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.22) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              maskImage: "radial-gradient(ellipse 70% 80% at 0% 0%, black, transparent)",
              WebkitMaskImage: "radial-gradient(ellipse 70% 80% at 0% 0%, black, transparent)",
            }}
          />
          {/* <div
            aria-hidden
            className="absolute -right-20 -top-24 size-96 rounded-full bg-[#25D366]/18 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -bottom-48 left-1/3 size-[30rem] rounded-full bg-[#087F47]/25 blur-3xl"
          /> */}

          <div className="relative grid items-stretch lg:grid-cols-[0.95fr_1.05fr]">
            <div className="flex min-w-0 flex-col px-7 py-10 sm:px-10 lg:border-r lg:border-white/10 lg:px-14 lg:py-16">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[12px] font-semibold text-white/85 backdrop-blur-sm">
                  <Sparkles className="size-3 text-[#9fffb4]" /> Book a demo
                </span>
                <h2 className="text-marketing-title mt-4 text-white ">
                  Ship your omnichannel CRM this week.
                </h2>
                <p className="mt-5 max-w-xl text-[15px] font-light leading-7 text-white/70">
                  Tell us how your team works today and we'll map the inbox, CRM, automation, and
                  deployment setup around your real channels and customer journey.
                </p>
              </div>

              <div className="mt-9 grid border-y border-white/12 sm:grid-cols-2">
                {proof.map((item, index) => (
                  <div
                    key={item.n}
                    className={`relative px-1 py-5 sm:px-5 ${index % 2 === 1 ? "sm:border-l sm:border-white/12" : ""} ${index > 1 ? "border-t border-white/12" : index === 1 ? "border-t border-white/12 sm:border-t-0" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 font-mono text-[12px] font-semibold text-[#80f59b]">
                        {item.n}
                      </span>
                      <div>
                        <p className="font-display text-[14px] font-semibold text-white">
                          {item.title}
                        </p>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-white/70">
                          {item.text}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-9">
                <div className="flex flex-wrap gap-3">
                  <WhatsAppCtaButton
                    size="xl"
                    label="Chat with us now"
                    message="Hi! I'd like to book a {site} demo."
                    analyticsLocation="demo-cta"
                    className="text-white w-full sm:w-fit"
                  />
                  <Button asChild variant="heroGhost" size="xl" className="w-full sm:w-fit">
                    <Link
                      to="/auth"
                      search={{ mode: "sign-up" }}
                      {...ctaAttrs("start-free", "demo-cta")}
                    >
                      Start free instead <ArrowRight />
                    </Link>
                  </Button>
                </div>
                <span className="mt-4 inline-flex items-center gap-2 text-[12px]  text-white/70">
                  <ShieldCheck className="size-3.5 text-[#80f59b]" /> Your details stay private
                </span>
              </div>
            </div>

            <div className="relative flex min-w-0 items-center bg-white/[0.035] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
              <div className="w-full">
                <div className="mb-4 flex items-center justify-between gap-4 px-1 text-white">
                  <div>
                    <p className="font-display text-lg font-semibold">Request your walkthrough</p>
                    <p className="mt-1 text-[12px] text-white/70">
                      Tailored to your team, channels, and deployment.
                    </p>
                  </div>
                  <span className="hidden items-center gap-2 text-base  text-white/70 sm:inline-flex">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#25D366] opacity-50" />
                      <span className="relative inline-flex size-2 rounded-full bg-[#25D366]" />
                    </span>
                    Reply within one business day
                  </span>
                </div>
                <LeadCaptureForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Pricing                                                      */
/* ============================================================ */
function Pricing() {
  const { supportEmail } = usePlatformBranding();
  const {
    plans,
    interval,
    setInterval: setBillingInterval,
    savingsPct,
    hasYearly,
    maxTrialDays,
  } = usePublicPlans("month");
  const { subscription } = useMyPlanSummary();

  // Was a literal "All prices in USD", which contradicted the prices above it
  // once the platform currency changed. Taken from the plans on display.
  const platformCurrency = useTenantCurrency();
  const displayCurrency =
    plans.find((p) => p.currency)?.currency?.toUpperCase() ?? platformCurrency;

  return (
    <section
      id="pricing"
      className="section-marketing relative scroll-mt-24 border-b border-border bg-background"
    >
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-48 bottom-0 size-[34rem] rounded-full bg-primary/7 blur-3xl" />
        <div
          className="absolute inset-x-0 top-0 h-96 opacity-50"
          style={{
            backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage: "radial-gradient(ellipse 55% 70% at 50% 0%, black 0%, transparent 78%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 55% 70% at 50% 0%, black 0%, transparent 78%)",
          }}
        />
      </div> */}

      <div className="relative container-marketing">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        <div className="grid items-end gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div className="max-w-xl">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Fair, flexible pricing
            </span>
            <h2 className="text-marketing-title mt-4">Simple pricing. No per-agent tax.</h2>
          </div>
          <div className="max-w-2xl lg:justify-self-end">
            <p className="text-marketing-lede">
              Every plan includes the full platform — inbox, automations, templates and CRM. You
              only choose how much volume and how many seats you need.
            </p>
          </div>
        </div>

        <div className="row-bleed-marketing mt-12 grid border-y border-border bg-background p-0">
          <div className="grid items-stretch lg:grid-cols-[1fr_auto_1fr]">
            <div className="hidden items-center gap-3 border-r border-border px-8 py-5 lg:flex">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-emerald-400/10 dark:text-emerald-400">
                <Clock className="size-4.5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {maxTrialDays > 0 ? `${maxTrialDays}-day free trial` : "Start without friction"}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  Test the complete platform before committing.
                </span>
              </span>
            </div>

            <div className="flex flex-col items-center justify-center px-6 py-4 lg:min-w-[22rem] bg-muted/50">
              <span className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
                Choose billing frequency
              </span>
              {hasYearly && (
                <div
                  role="group"
                  aria-label="Billing interval"
                  className="inline-grid max-w-full grid-cols-2 overflow-hidden rounded-full border border-border bg-background p-1 text-xs sm:text-sm"
                >
                  {(["month", "year"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={interval === value}
                      onClick={() => {
                        setBillingInterval(value);
                        trackMarketing("cta_click", {
                          cta_id: "billing-interval",
                          location: "home-pricing",
                          label: value,
                        });
                      }}
                      className={`rounded-full px-3 py-2 font-medium transition-all duration-200 sm:px-4 ${
                        interval === value
                          ? "bg-primary text-white shadow-sm"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      {value === "month" ? "Monthly" : "Yearly"}
                      <span className="hidden sm:inline"> Billing</span>
                      {value === "year" && savingsPct > 0 && (
                        <span
                          className={`ml-1.5 hidden text-[11px] font-semibold uppercase sm:inline ${
                            interval === value
                              ? "text-emerald-200"
                              : "text-primary dark:text-emerald-400"
                          }`}
                        >
                          −{savingsPct}%
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden items-center justify-end gap-3 border-l border-border px-8 py-5 lg:flex">
              <span>
                <span className="block text-right text-sm font-semibold text-foreground">
                  Flexible billing
                </span>
                <span className="mt-0.5 block text-right text-[11px] text-muted-foreground">
                  Upgrade, downgrade, or cancel anytime.
                </span>
              </span>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-emerald-400/10 dark:text-emerald-400">
                <ShieldCheck className="size-4.5" />
              </span>
            </div>
          </div>

          <CurrentPlanBanner subscription={subscription} />
        </div>

        {plans.length === 0 ? (
          <p className="text-marketing-meta mt-14 text-center">
            Plans are being updated —{" "}
            <Link to="/pricing" className="text-accent hover:underline">
              see full pricing
            </Link>
            .
          </p>
        ) : (
          <div className="row-bleed-marketing grid grid-cols-1 border-b border-border bg-background p-0 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p, planIndex) => {
              const contactSales = isContactSalesPlan(p);
              const perMonth = monthlyEquivalent(p);
              const currentPlan = isCurrentPlan(p.code, subscription);
              const isLastMobileRow = planIndex === plans.length - 1;
              const isLastTabletRow = planIndex >= plans.length - (plans.length % 2 || 2);
              const isLastDesktopRow = planIndex >= plans.length - (plans.length % 4 || 4);
              const cta =
                p.cta_label ??
                (contactSales
                  ? "Contact sales"
                  : p.price_cents === 0
                    ? "Start free"
                    : "Start free trial");
              return (
                <div
                  key={p.id}
                  className={`group relative flex min-w-0 flex-col overflow-hidden rounded-0 border-r border-b border-border p-6 transition-all duration-300 ${isLastMobileRow ? "border-b-0" : ""} sm:border-b sm:[&:nth-child(2n)]:border-r-0 sm:p-4 ${isLastTabletRow ? "sm:border-b-0" : ""} lg:border-b lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0 ${isLastDesktopRow ? "lg:border-b-0" : ""} ${
                    p.highlight
                    // ? "border-[#015941]/45 bg-[#eff9f2] dark:border-emerald-400/35 dark:bg-emerald-950/30"
                    // : "border-border bg-background hover:shadow-xl"
                  } ${currentPlan ? "ring-2 ring-inset ring-[#25D366]/60" : ""}`}
                >
                  {/* {p.highlight && (
                    <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-primary" />
                  )} */}
                  <div className="mb-8 rounded-control border border-border bg-muted/50 p-6 sm:min-h-[18.25rem]">
                    <div className="flex min-h-7 items-start justify-between gap-3">
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                        PLAN {String(planIndex + 1).padStart(2, "0")}
                      </span>
                      {p.badge && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-[9px] font-semibold uppercase text-white shadow-sm">
                          <Sparkles className="size-2.5" />
                          {p.badge}
                        </span>
                      )}
                    </div>

                    {currentPlan && (
                      <div className="mt-3 w-fit">
                        <CurrentPlanPill subscription={subscription} />
                      </div>
                    )}

                    <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
                      {p.name}
                    </h3>
                    <div className="mt-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                      <span className="font-display text-[2.35rem] font-semibold leading-none text-foreground">
                        {p.price_cents === 0 ? "Free" : formatPlanPrice(p.price_cents, p.currency)}
                      </span>
                      {p.price_cents > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {p.interval === "lifetime"
                            ? "one-time"
                            : `/ ${p.interval === "year" ? "year" : "month"}`}
                        </span>
                      )}
                    </div>
                    {perMonth && (
                      <p className="mt-1.5 text-[11px] font-medium text-primary dark:text-emerald-400">
                        {perMonth} / month, billed yearly
                      </p>
                    )}
                    {(p.tagline || p.description) && (
                      <p className="mt-3 min-h-10 text-[12px] leading-relaxed text-muted-foreground">
                        {p.tagline ?? p.description}
                      </p>
                    )}
                    {p.trial_days > 0 && !contactSales && (
                      <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-[#015941]/10 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-primary dark:bg-emerald-950/50 dark:text-emerald-300">
                        <Clock className="size-3" />
                        {p.trial_days}-day free trial
                      </p>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase text-muted-foreground">
                      Included in this plan
                    </p>
                    <ul className="flex-1 space-y-2.5 text-sm">
                      {planBullets(p).map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2.5 text-[12px] leading-relaxed text-foreground/75"
                        >
                          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/8 dark:bg-emerald-500/15">
                            <Check
                              className="size-2.5 text-primary dark:text-emerald-400"
                              strokeWidth={2.4}
                            />
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto border-t border-border row-bleed-marketing">
                    {contactSales ? (
                      <a
                        href={`mailto:${supportEmail ?? "sales@wacrm.com"}?subject=Enterprise%20inquiry`}
                        {...ctaAttrs(`plan-${p.code}`, "home-pricing", "pricing_click", cta)}
                        data-analytics-plan={p.code}
                        className="px-6 py-6 sm:-mx-4 sm:-mb-4 sm:px-8 flex items-center justify-between gap-2 text-base font-semibold  transition-colors hover:bg-muted"
                      >
                        {cta} <ArrowRight className="size-3.5" />
                      </a>
                    ) : currentPlan ? (
                      <Link
                        to="/billing"
                        data-analytics-plan={p.code}
                        className="px-6 py-6 sm:-mx-4 sm:-mb-4 sm:px-8 flex items-center justify-between gap-2 text-base font-semibold  transition-colors hover:bg-muted"
                      >
                        Manage your plan <ArrowRight className="size-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to="/auth"
                        search={{ plan: p.code, mode: "sign-up" } as never}
                        {...ctaAttrs(`plan-${p.code}`, "home-pricing", "pricing_click", cta)}
                        data-analytics-plan={p.code}
                        className="px-6 py-6 sm:-mx-4 sm:-mb-4 sm:px-8 flex items-center justify-between gap-2 text-base font-semibold  transition-colors hover:bg-muted"
                      >
                        {cta} <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4 text-base text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span>All prices in {displayCurrency}.</span>
            <span aria-hidden className="hidden size-1 rounded-full bg-border sm:inline-block" />
            <span>No hidden per-agent fees.</span>
            <span aria-hidden className="hidden size-1 rounded-full bg-border sm:inline-block" />
            <span>Cancel anytime.</span>
          </p>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 font-semibold text-[13px] text-primary transition-colors hover:text-[#087F47] dark:text-emerald-400"
          >
            Compare every plan <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* FAQ                                                          */
/* ============================================================ */
// The FAQ is a standalone, searchable component (see components/marketing/faq-section).

/* ============================================================ */
/* APP Marketing                                                */
/* ============================================================ */

function MarketingSection() {
  const downloadStats = [
    { value: "16+", label: "Connected channels" },
    { value: "40+", label: "Platform modules" },
    { value: "04+", label: "AI providers" },
  ];

  return (
    <section id="download" className="section-marketing relative overflow-hidden bg-background">
      <div className="container-marketing relative p-0">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        <div className="relative overflow-hiddenbg-[#f5faf8] px-5 py-12 sm:px-10 sm:py-16 lg:px-16 lg:py-20 dark:border-white/10 dark:bg-[#092c25]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 12% 10%, rgba(176,151,255,0.2), transparent 30%), radial-gradient(circle at 88% 12%, rgba(88,215,255,0.18), transparent 30%), radial-gradient(circle at 72% 90%, rgba(37,211,102,0.16), transparent 32%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-4 rounded-[1.45rem] border border-white dark:border-white/10 shadow-xs"
          />

          <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/65 px-3 py-1.5 text-[12px] font-semibold text-primary shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/8 dark:text-emerald-300">
              <Sparkles className="size-3" /> Production-ready omnichannel SaaS
            </span>

            <h2 className="mt-6 max-w-3xl font-display text-[clamp(2rem,4.4vw,4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-foreground">
              Launch your own omnichannel CRM today.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Download the complete <Brand /> platform and start with a unified inbox, CRM, AI
              automation, helpdesk, commerce, billing, and multi-tenant administration already
              connected.
            </p>

            <div className="mt-9 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
              {downloadStats.map(({ value, label }) => (
                <div
                  key={label}
                  className="rounded-control border border-border/75 bg-white/50 px-6 py-12 backdrop-blur-md dark:border-white/10 dark:bg-white/7"
                >
                  <span className="block bg-gradient-to-r from-[#015941] via-[#20a86b] to-[#6366f1] bg-clip-text font-display text-5xl font-bold text-transparent">
                    {value}
                  </span>
                  <span className="mt-3 block text-[12px] font-medium text-muted-foreground">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <a
              href="https://codecanyon.net/item/swiftchat-the-ultimate-aipowered-messaging-communication-saas-platform/61419649"
              target="_blank"
              rel="noreferrer"
              {...ctaAttrs("download-wacrm", "download-section")}
              className="group mt-10 inline-flex min-h-16 items-center justify-center gap-2.5 rounded-control bg-primary px-12 py-4 text-sm font-semibold text-background transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
            >
              Download <Brand />
              <Download className="size-4" />
            </a>

            <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
              Complete source code, guided setup, deployment assets, documentation, and buyer
              support included.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Footer                                                       */
/* ============================================================ */
function Footer() {
  const columns = [
    {
      title: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "Product tour", href: "#workflow" },
        { label: "Solutions", href: "#industries" },
        { label: "Pricing", href: "#pricing" },
      ],
    },
    {
      title: "Resources",
      links: [
        ...(SHOW_RESOURCE_LINKS
          ? [
              { label: "Documentation", href: docsUrl() },
              { label: "Install guide", href: "/install" },
            ]
          : []),
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy policy", href: "/legal/privacy-policy" },
        { label: "Terms of service", href: "/legal/terms-of-service" },
        { label: "Cookie policy", href: "/legal/cookie-policy" },
        { label: "DPA", href: "/legal/dpa" },
      ],
    },
  ];
  const channels = [
    { Icon: SiWhatsapp, name: "WhatsApp" },
    { Icon: SiMessenger, name: "Messenger" },
    { Icon: SiInstagram, name: "Instagram" },
    { Icon: SiTelegram, name: "Telegram" },
  ];
  return (
    <footer className="relative border-t border-white/10 bg-gradient-hero">
      {/* Multi-layer gradient background: dot grid + brand-green and accent glows, masked to fade toward the
          edges. Clipped in its own layer so it doesn't cut off the corner marks below. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <DotPattern className="fill-white/10 [mask-image:radial-gradient(640px_circle_at_15%_0%,white,transparent)]" />
        <div className="pointer-events-none absolute -top-24 right-0 size-[420px] rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 size-[360px] rounded-full bg-accent/25 blur-3xl" />
      </div>
      <div className="relative container-marketing border-white/5! pt-20 pb-14 lg:pt-24">
        <CornerPlus corner="tl" className="text-background/60 dark:text-foreground/60" />
        <CornerPlus corner="tr" className="text-background/60 dark:text-foreground/60" />
        <div className="row-bleed-marketing px-0 border-y border-white/5 ">
          <div className="grid gap-8 md:gap-y-0 lg:gap-8 md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
            <div className="min-w-0 border-b lg:border-b-0 md:border-r border-white/5 px-8 py-12 lg:px-12">
              <Link to="/" className="flex min-w-0 items-center gap-2 cursor-pointer">
                <PlatformLogo alt="" className="size-6 shrink-0 object-contain" />
                <BrandWordmark className="brand-wordmark min-w-0 truncate text-xl text-background dark:text-foreground" />
              </Link>
              <p className="mt-4 max-w-xs text-sm text-background/70 dark:text-foreground/70">
                The self-hosted omnichannel CRM for sales, support and marketing teams.
              </p>
              <div className="mt-6 flex items-center gap-3">
                {channels.map(({ Icon, name }) => (
                  <span
                    key={name}
                    title={name}
                    className="flex size-8 items-center justify-center rounded-full bg-background/10 text-background/70 dark:text-foreground/70 transition-colors hover:bg-background/20 hover:text-background dark:hover:text-foreground"
                  >
                    <Icon className="size-4" />
                  </span>
                ))}
              </div>
              <Button asChild variant="primary" size="sm" className="mt-6">
                <Link
                  to="/auth"
                  search={{ mode: "sign-up" }}
                  {...ctaAttrs("start-free-trial", "footer")}
                >
                  Start free trial <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
            {columns.map((c) => (
              <div
                key={c.title}
                className="min-w-0 border-y lg:border-b-0 md:border-t-0 md:border-x first:md:boerder-r-0 last:border-r-0 last:border-b-0 border-white/5 px-8 py-12"
              >
                <p className="font-display text-xs font-semibold uppercase text-background/50 dark:text-foreground/50">
                  {c.title}
                </p>
                <ul className="mt-5 space-y-3 text-sm text-background/70 dark:text-foreground/70">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="link-marketing-onhero group inline-flex items-center gap-1.5"
                      >
                        <span className="size-1 rounded-full bg-background/30 dark:bg-foreground/30 transition-colors group-hover:bg-accent dark:group-hover:bg-accent" />
                        <span className="transition-transform group-hover:translate-x-0.5">
                          {l.label}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 pt-6 text-sm text-background/70 dark:text-foreground/70">
          <span className="truncate">
            &copy; {new Date().getFullYear()} <Brand />.{" "}
            <span className="hidden sm:inline-flex">All rights reserved.</span>
          </span>
          {/* <span className="shrink-0 text-xs">
            Not affiliated with WhatsApp or Meta Platforms, Inc.
          </span> */}
          <div className="shrink-0 flex flex-wrap items-center gap-4 text-[11px] uppercase text-background/70 dark:text-foreground/70">
            <a
              href={docsUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 hover:text-white transition-colors"
            >
              <BookOpen className="size-3" /> Docs
            </a>
            <span className="w-1 h-1 flex items-center justify-center bg-white/25 rounded-full"></span>
            <a
              href="/install"
              className="inline-flex items-center gap-2 hover:text-white transition-colors"
            >
              <Server className="size-3" /> Self-host
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

{
  /* Connection map */
}
function ConnectionMap() {
  const networkNodes = [
    {
      label: "WhatsApp",
      Icon: SiWhatsapp,
      color: "#25D366",
      x: 110,
      y: 90,
      path: "M 270 205 V 105 Q 270 90 255 90 H 110",
      delay: "0s",
    },
    {
      label: "Instagram",
      Icon: SiInstagram,
      color: "#E1306C",
      x: 360,
      y: 70,
      path: "M 294 205 V 85 Q 294 70 309 70 H 360",
      delay: "-0.7s",
    },
    {
      label: "Messenger",
      Icon: SiMessenger,
      color: "#0084FF",
      x: 160,
      y: 205,
      path: "M 250 205 H 160",
      delay: "-1.4s",
    },
    {
      label: "Telegram",
      Icon: SiTelegram,
      color: "#26A5E4",
      x: 480,
      y: 205,
      path: "M 314 205 H 480",
      delay: "-2.1s",
    },
    {
      label: "Email",
      Icon: Mail,
      color: "#64748B",
      x: 282,
      y: 360,
      path: "M 282 225 V 360",
      delay: "-2.8s",
    },
    {
      label: "AI models",
      Icon: Bot,
      color: "#015941",
      x: 460,
      y: 340,
      path: "M 314 215 V 325 Q 314 340 329 340 H 460",
      delay: "-3.5s",
    },
  ];

  return (
    <div>
      <style>{`
              @keyframes integration-signal { to { stroke-dashoffset: -200; } }
              @keyframes integration-hub-pulse {
                0%, 100% { transform: scale(1); opacity: .28; }
                50% { transform: scale(1.16); opacity: 0; }
              }
              .integration-signal { animation: integration-signal 4s linear infinite; }
              .integration-hub-pulse { animation: integration-hub-pulse 3s ease-in-out infinite; }
            `}</style>
      <div
        aria-hidden
        className="absolute inset-0 opacity-55"
        style={{
          backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(circle at 50% 50%, black 0%, rgba(0,0,0,.65) 45%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(circle at 50% 50%, black 0%, rgba(0,0,0,.65) 45%, transparent 78%)",
        }}
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#25D366]/10 blur-3xl"
      />

      <svg
        aria-hidden
        viewBox="0 0 564 410"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <linearGradient id="integration-signal-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#25D366" stopOpacity="0" />
            <stop offset="50%" stopColor="#25D366" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#015941" stopOpacity="0" />
          </linearGradient>
        </defs>
        {networkNodes.map((node) => (
          <g key={node.label}>
            <path
              d={node.path}
              fill="none"
              stroke="var(--border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={node.path}
              fill="none"
              stroke="url(#integration-signal-gradient)"
              strokeWidth="2"
              strokeDasharray="40 160"
              vectorEffect="non-scaling-stroke"
              className="integration-signal"
              style={{ animationDelay: node.delay }}
            />
          </g>
        ))}
      </svg>

      <div className="absolute left-1/2 top-1/2 z-20 flex size-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-control border border-border bg-background p-4 pt-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-control border border-border bg-muted/35 p-2.5">
          <PlatformLogo alt="" className="size-10 object-contain" />
        </div>
        <p className="mt-2 text-[11px] font-semibold text-foreground">
          <BrandWordmark /> Hub
        </p>
        <span className="integration-hub-pulse pointer-events-none absolute inset-0 rounded-control border-2 border-[#25D366]/30" />
      </div>

      {networkNodes.map((node) => (
        <div
          key={node.label}
          title={node.label}
          aria-label={node.label}
          className="absolute z-10 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-control border border-border bg-background transition-all duration-300 hover:-translate-y-[55%] sm:size-14"
          style={{
            left: `${(node.x / 564) * 100}%`,
            top: `${(node.y / 410) * 100}%`,
            color: node.color,
          }}
        >
          <node.Icon className="size-5 sm:size-6" />
          <span className="sr-only">{node.label}</span>
        </div>
      ))}

      <div className="absolute bottom-5 left-8 z-10 flex items-center gap-4 rounded-full border border-border bg-background/90 px-4 py-2  backdrop-blur-sm">
        <span className="flex items-center gap-1.5 text-[9px] font-medium text-muted-foreground">
          <Plug className="size-3 text-primary" /> REST API
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="flex items-center gap-1.5 text-[9px] font-medium text-muted-foreground">
          <Workflow className="size-3 text-primary" /> Signed webhooks
        </span>
      </div>
    </div>
  );
}
