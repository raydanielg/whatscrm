import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Database,
  HeartHandshake,
  MessagesSquare,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { MarketingShell } from "@/components/app/marketing-shell";
import platformPreviewImg from "@/assets/marketing/platform-preview.jpg";
import integrationsChannelsImg from "@/assets/marketing/platform-stack-illustration.png";
import { redirectSignedInFromMarketing } from "@/lib/auth/marketing-redirect";

export const Route = createFileRoute("/about")({
  ssr: false,
  beforeLoad: redirectSignedInFromMarketing,
  head: () => ({
    meta: [
      { title: "About" },
      {
        name: "description",
        content: `${BRAND_NAME} is built by a distributed team on a mission to make WhatsApp a first-class CRM channel for every business.`,
      },
      { property: "og:title", content: `About ${BRAND_NAME}` },
      {
        property: "og:description",
        content: "Our mission: make WhatsApp a first-class CRM channel for every business.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const principles = [
    {
      icon: ShieldCheck,
      title: "Enterprise architecture",
      description:
        "Workspace isolation, role-based access, and security controls are part of the foundation.",
    },
    {
      icon: HeartHandshake,
      title: "Honest pricing",
      description:
        "Plans are designed around usage and capability, without a per-agent tax on collaboration.",
    },
    {
      icon: Database,
      title: "Your data, your choice",
      description:
        "Choose a managed setup or self-host the platform on infrastructure you control.",
    },
  ];

  return (
    <MarketingShell>
      <section className="relative overflow-hidden bg-background">
        <div className="container-marketing">
          <div className="grid items-end gap-6 lg:grid-cols-[1fr_0.85fr] lg:gap-16">
            <div className="max-w-2xl">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
                About <Brand />
              </span>
              <h1 className="text-marketing-title mt-3">
                The WhatsApp CRM built for the next billion conversations.
              </h1>
            </div>
            <p className="text-marketing-lede max-w-xl lg:justify-self-end">
              For most of the world, WhatsApp <em>is</em> the customer channel. Yet the tools teams
              use to manage it are stuck a decade behind email. We&apos;re building a more connected
              way to serve customers where the conversations already happen.
            </p>
          </div>

          <div className="mt-10 grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
            <div className="surface-marketing-card overflow-hidden p-2">
              <img
                src={platformPreviewImg}
                alt="Illustration of a shared inbox, automation, and customer insights in one workspace"
                loading="eager"
                width={1024}
                height={768}
                className="aspect-[4/3] w-full rounded-control object-cover"
              />
            </div>
            <div className="max-w-xl">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">Why we&apos;re building <Brand /></span>
              <h2 className="text-marketing-title mt-3">
                One conversation should carry its context with it.
              </h2>
              <p className="text-marketing-lede mt-4">
                A customer shouldn&apos;t have to repeat themselves when a conversation moves from
                an automated reply to a teammate, or from support to sales. <Brand /> brings
                conversations, customer records, and team workflows into one shared platform.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: MessagesSquare, text: "Shared team inbox" },
                  { icon: Workflow, text: "Automations and handoffs" },
                  { icon: Users, text: "CRM and team collaboration" },
                  { icon: Bot, text: "AI tools with human oversight" },
                ].map((item) => (
                  <div
                    key={item.text}
                    className="flex items-center gap-3 rounded-control border border-border bg-background px-4 py-3"
                  >
                    <span className="chip-marketing-icon size-9">
                      <item.icon className="size-4" aria-hidden />
                    </span>
                    <span className="text-sm font-medium text-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-14 grid items-center gap-8 border-y border-border py-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:py-14">
            <div className="max-w-xl">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">Made for the way teams work</span>
              <h2 className="text-marketing-title mt-3">
                Keep channels connected. Give every team the same picture.
              </h2>
              <p className="text-marketing-lede mt-4">
                WhatsApp is at the heart of the experience, alongside channels like Instagram,
                Messenger, Telegram, SMS, email, and live chat. Conversations can connect to
                customer records, campaigns, support work, and reporting instead of disappearing
                into separate tools.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                The result is a shared view for sales, support, and marketing—with the controls
                administrators need to organize teams and workspaces.
              </p>
            </div>
            <div className="surface-marketing-card overflow-hidden p-2">
              <img
                src={integrationsChannelsImg}
                alt="Illustration showing messaging channels connected to a shared workspace"
                loading="lazy"
                width={1024}
                height={768}
                className="aspect-[4/3] w-full rounded-control bg-background object-contain"
              />
            </div>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <article className="surface-marketing-card p-6 sm:p-8">
              <div className="chip-marketing-icon">
                <Users className="size-4" aria-hidden />
              </div>
              <h2 className="text-marketing-card-title mt-5">A team that builds and operates</h2>
              <p className="text-marketing-card-body mt-3">
                We&apos;re a distributed team of engineers, designers, and operators who&apos;ve
                built and scaled communication products at companies like Meta, Twilio, Zendesk, and
                HubSpot. We ship weekly and self-host our own stack, using the product in the kind
                of hands-on environment it is designed to support.
              </p>
            </article>

            <article className="surface-marketing-card p-6 sm:p-8">
              <div className="chip-marketing-icon">
                <Database className="size-4" aria-hidden />
              </div>
              <h2 className="text-marketing-card-title mt-5">Flexible by design</h2>
              <p className="text-marketing-card-body mt-3">
                Every organization has different needs for ownership and operations. <Brand /> is
                designed for isolated workspaces, role-based access, and deployment choices—from
                managed hosting to running the platform on your own infrastructure.
              </p>
            </article>
          </div>

          <div className="mt-12">
            <div className="max-w-2xl">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
                What guides us
              </span>
              <h2 className="text-marketing-title mt-2">Principles behind the platform.</h2>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {principles.map((principle, index) => (
                <article
                  key={principle.title}
                  className="surface-marketing-card-interactive flex min-h-40 flex-col p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="chip-marketing-icon">
                      <principle.icon className="size-4" aria-hidden />
                    </div>
                    <span className="font-mono text-[11px] font-medium text-muted-foreground/70">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="text-marketing-card-title mt-5">{principle.title}</h3>
                  <p className="text-marketing-card-body mt-2">{principle.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-5 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-base font-semibold text-foreground">
                Build better customer conversations with us.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Find the right plan for your team.
              </p>
            </div>
            <Link
              to="/pricing"
              className="inline-flex min-h-11 items-center justify-between gap-3 rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:justify-center"
            >
              Explore pricing <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
