import { Brand } from "@/components/brand";
import { MarketingShell } from "@/components/app/marketing-shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  Inbox,
  Megaphone,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

import featureAnalyticsImg from "@/assets/marketing/feature-analytics-new.png";
import featureAutomationsImg from "@/assets/marketing/feature-automations-new.png";
import featureBroadcastImg from "@/assets/marketing/feature-broadcast-new.png";
import featureHelpdeskImg from "@/assets/marketing/feature-helpdesk-new.png";
import featureCommerceImg from "@/assets/marketing/stepper-ecommerce.jpg";
import featureAppointmentsImg from "@/assets/marketing/stepper-flow.jpg";
import featureAiStudioImg from "@/assets/marketing/feature-ai-studio.png";
import featureSharedInboxImg from "@/assets/marketing/feature-shared-inbox.png";
import { redirectSignedInFromMarketing } from "@/lib/auth/marketing-redirect";

export const Route = createFileRoute("/features")({
  ssr: false,
  beforeLoad: redirectSignedInFromMarketing,
  head: () => ({
    meta: [
      { title: "Features" },
      {
        name: "description",
        content:
          "Unified inbox, AI Studio, automations, analytics, multi-tenant workspaces, and enterprise security.",
      },
      { property: "og:title", content: "Features" },
      {
        property: "og:description",
        content: "Everything your team needs to run WhatsApp at scale.",
      },
    ],
  }),
  component: FeaturesPage,
});

type FeatureCard = {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
};

const featureCards: FeatureCard[] = [
  {
    icon: Inbox,
    title: "Unified inbox",
    description: "Keep conversations, assignments, notes and escalations in one shared workspace.",
    bullets: ["Team routing", "Private notes", "SLA timers", "Smart filters"],
  },
  {
    icon: Sparkles,
    title: "AI Studio",
    description: "Draft replies, classify intent, summarise threads and generate marketing copy.",
    bullets: ["Thread summaries", "Intent detection", "Reply suggestions", "Model switching"],
  },
  {
    icon: Workflow,
    title: "Automations",
    description: "Trigger rules that keep conversations moving without manual follow-up.",
    bullets: ["Welcome flows", "Auto-tagging", "Escalation rules", "Off-hours replies"],
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Measure delivery, response and campaign performance across your business.",
    bullets: ["Team scorecards", "Channel insights", "Campaign reports", "Exportable views"],
  },
  {
    icon: Users,
    title: "Multi-tenant workspaces",
    description: "Give teams and clients dedicated workspaces with role-based access.",
    bullets: ["Granular roles", "Client isolation", "Admin controls", "Audit trails"],
  },
  {
    icon: ShieldCheck,
    title: "Security & infrastructure",
    description: "Protect customer data with security controls and flexible deployment options.",
    bullets: ["Row Level Security", "SSO ready", "Audit history", "Self-host deployment"],
  },
];

const workflowCards = [
  {
    title: "Shared inbox",
    image: featureSharedInboxImg,
    description:
      "Give every agent the full customer context without duplicating work across tools.",
    bullets: [
      "Assign and escalate",
      "Merge duplicate threads",
      "Keep a single conversation timeline",
    ],
  },
  {
    title: "AI-powered conversations",
    image: featureAiStudioImg,
    description:
      "Use AI to draft answers, summarise decisions and route conversations with humans in control.",
    bullets: [
      "Smart reply suggestions",
      "Intent and sentiment analysis",
      "Quick handoff summaries",
    ],
  },
  {
    title: "Campaigns & commerce",
    image: featureBroadcastImg,
    description:
      "Turn WhatsApp into a revenue channel with campaigns, carts and conversion tracking.",
    bullets: ["Segmented broadcasts", "Catalog and order flows", "Reminders and follow-ups"],
  },
];

const moduleCards = [
  {
    icon: MessagesSquare,
    title: "Helpdesk operations",
    description: "Handle support and sales with SLA visibility and routing logic.",
    image: featureHelpdeskImg,
  },
  {
    icon: Zap,
    title: "Automation engine",
    description: "Qualify leads, trigger messages and move agents through workflows.",
    image: featureAutomationsImg,
  },
  {
    icon: BarChart3,
    title: "Performance reporting",
    description: "Track delivery, CSAT and team productivity with clear dashboards.",
    image: featureAnalyticsImg,
  },
  {
    icon: Megaphone,
    title: "Broadcast marketing",
    description: "Launch approved campaigns and optimise each sequence from one hub.",
    image: featureBroadcastImg,
  },
  {
    icon: Store,
    title: "Commerce flows",
    description: "Run catalog browsing, cart reminders and checkout nudges in chat.",
    image: featureCommerceImg,
  },
  {
    icon: CalendarClock,
    title: "Appointments",
    description: "Accept bookings, confirm details and send reminders in the same workflow.",
    image: featureAppointmentsImg,
  },
];

function FeaturesPage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden bg-surface border-b border-border">
        <div className="container-marketing py-16 lg:py-20">
          <div className="grid items-end gap-6 lg:grid-cols-[1.3fr_0.9fr] lg:gap-12">
            <div className="max-w-2xl">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
                Platform
              </span>
              <h1 className="mt-3 text-marketing-title">
                Everything you need to run WhatsApp at scale.
              </h1>
            </div>
            <p className="text-marketing-lede max-w-xl lg:justify-self-end">
              <Brand /> brings helpdesk, CRM, marketing automation and AI workflows together in one
              customer platform built for real-world WhatsApp operations.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {["Shared inbox", "AI replies", "Automation rules", "Team workspaces", "Security"].map(
              (item) => (
                <span
                  key={item}
                  className="rounded-full border border-border bg-background px-3 py-1.5"
                >
                  {item}
                </span>
              ),
            )}
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((feature, index) => (
              <article
                key={feature.title}
                className="surface-marketing-card-interactive flex min-h-52 flex-col p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="chip-marketing-icon">
                    <feature.icon className="size-4" aria-hidden />
                  </div>
                  <span className="font-mono text-[11px] font-medium text-muted-foreground/70">
                    0{index + 1}
                  </span>
                </div>
                <h2 className="text-marketing-card-title mt-5">{feature.title}</h2>
                <p className="text-marketing-card-body mt-2">{feature.description}</p>
                <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-2">
                      <Check className="size-3.5 text-accent" aria-hidden />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-marketing bg-gradient-subtle border-b border-border">
        <div className="container-marketing">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Built for every workflow
            </span>
            <h2 className="mt-3 text-marketing-title">
              From the first reply to the final conversion.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {workflowCards.map((card) => (
              <article
                key={card.title}
                className="surface-marketing-card-interactive overflow-hidden"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                  <img
                    src={card.image}
                    alt={card.title}
                    loading="lazy"
                    width={768}
                    height={576}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-marketing-card-title">{card.title}</h3>
                  <p className="text-marketing-card-body mt-2">{card.description}</p>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {card.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-marketing bg-surface border-b border-border">
        <div className="container-marketing">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Power across the stack
            </span>
            <h2 className="mt-3 text-marketing-title">
              A single operating layer for support, sales and growth.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {moduleCards.map((module) => (
              <article
                key={module.title}
                className="surface-marketing-card-interactive overflow-hidden"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                  <img
                    src={module.image}
                    alt={module.title}
                    loading="lazy"
                    width={768}
                    height={576}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-col p-6">
                  <div className="chip-marketing-icon">
                    <module.icon className="size-4" aria-hidden />
                  </div>
                  <h3 className="text-marketing-card-title mt-4">{module.title}</h3>
                  <p className="text-marketing-card-body mt-2">{module.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-marketing bg-background">
        <div className="container-marketing">
          <div className="rounded-control border border-border bg-surface p-6 sm:p-8 lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
                  Why teams switch
                </span>
                <h2 className="mt-3 text-marketing-title">
                  One system. Better service. Faster growth.
                </h2>
                <p className="mt-4 max-w-xl text-marketing-lede text-muted-foreground">
                  Replace fragmented inboxes, disconnected automations and reporting tools with one
                  platform designed for customer conversations.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Faster resolution", value: "3x" },
                  { label: "Qualified leads", value: "+42%" },
                  { label: "Automation coverage", value: "90%" },
                  { label: "Global teams", value: "24/7" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-control border border-border bg-background p-4"
                  >
                    <p className="font-display text-3xl font-semibold text-foreground">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-marketing bg-surface">
        <div className="container-marketing pt-0">
          <div className="flex flex-col gap-5 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-base font-semibold text-foreground">
                Ready to see the platform in action?
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Explore the plans or book a walkthrough with the team.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/pricing"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Explore pricing <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                to="/contact"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-border px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
