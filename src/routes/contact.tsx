import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Clock3, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { MarketingShell } from "@/components/app/marketing-shell";
import { useBrandName } from "@/hooks/use-brand-name";
import { redirectSignedInFromMarketing } from "@/lib/auth/marketing-redirect";
import { usePlatformBranding } from "@/hooks/use-platform-branding";

export const Route = createFileRoute("/contact")({
  ssr: false,
  beforeLoad: redirectSignedInFromMarketing,
  head: () => ({
    meta: [
      { title: "Contact" },
      {
        name: "description",
        content: `Talk to sales, get support, or partner with ${BRAND_NAME}. We reply within one business day.`,
      },
      { property: "og:title", content: `Contact ${BRAND_NAME}` },
      { property: "og:description", content: "Talk to sales, get support, or partner with us." },
    ],
  }),
  component: ContactPage,
});

const quickFacts = [
  { icon: Clock3, label: "Response time", value: "Within one business day" },
  { icon: ShieldCheck, label: "Coverage", value: "Global support for sales + onboarding" },
  { icon: Phone, label: "Best for", value: "Demo requests, trials, and enterprise moves" },
];

const commonQuestions = [
  {
    title: "Who should contact sales?",
    body: "If you’re exploring a larger rollout, adding WhatsApp to a new workflow, or need custom onboarding, sales is the right team.",
  },
  {
    title: "Do you offer implementation help?",
    body: "Yes. We can help with account setup, channel configuration, migration planning, and team rollout recommendations.",
  },
  {
    title: "Can I talk with product or engineering?",
    body: "Absolutely. We’re happy to connect product, ops, or technical stakeholders during evaluation or pilot reviews.",
  },
];

function ContactPage() {
  const brandName = useBrandName();
  const { supportEmail } = usePlatformBranding();
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    topic: "",
    message: "",
  });

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const lines = [
      form.name ? `Name: ${form.name}` : null,
      form.email ? `Email: ${form.email}` : null,
      form.company ? `Company: ${form.company}` : null,
      form.topic ? `Topic: ${form.topic}` : null,
      "",
      form.message || "No additional details provided.",
    ].filter(Boolean);

    const subject = encodeURIComponent(
      form.topic ? `${brandName} contact request: ${form.topic}` : `${brandName} contact request`,
    );
    const body = encodeURIComponent(lines.join("\n"));

    window.location.href = `mailto:${supportEmail ?? "hello@wacrm.app"}?subject=${subject}&body=${body}`;
  };

  return (
    <MarketingShell>
      <section className="relative overflow-hidden bg-background">
        <div className="container-marketing pb-18 pt-16 md:pt-20 lg:pt-24">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-16">
            <div className="max-w-xl">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
                Contact
              </span>
              <h1 className="text-marketing-title mt-4">
                Let’s build your next customer conversation flow.
              </h1>
            </div>
            <p className="text-marketing-lede max-w-2xl lg:justify-self-end">
              Whether you’re evaluating the platform, onboarding a new team, or solving a support
              issue, we’ll connect you with the right people quickly.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="surface-marketing-card p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Quick message
                  </p>
                  <h2 className="text-marketing-card-title mt-2">Tell us what you need.</h2>
                </div>
                <div className="chip-marketing-icon">
                  <Sparkles className="size-4" aria-hidden />
                </div>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">Name</span>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) => handleChange("name", event.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-control border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">Work email</span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => handleChange("email", event.target.value)}
                      placeholder="you@company.com"
                      className="w-full rounded-control border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">Company</span>
                    <input
                      type="text"
                      value={form.company}
                      onChange={(event) => handleChange("company", event.target.value)}
                      placeholder="Acme Inc."
                      className="w-full rounded-control border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </label>
                  <label className="space-y-2 text-sm text-foreground">
                    <span className="font-medium">I’m reaching out about</span>
                    <select
                      value={form.topic}
                      onChange={(event) => handleChange("topic", event.target.value)}
                      className="w-full rounded-control border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    >
                      <option value="">Select a topic</option>
                      <option>Product demo</option>
                      <option>Support issue</option>
                      <option>Enterprise rollout</option>
                      <option>Partnership</option>
                    </select>
                  </label>
                </div>

                <label className="block space-y-2 text-sm text-foreground">
                  <span className="font-medium">Message</span>
                  <textarea
                    rows={5}
                    value={form.message}
                    onChange={(event) => handleChange("message", event.target.value)}
                    placeholder="Tell us about your team, your goal, and what you’re hoping to achieve with WhatsApp CRM."
                    className="w-full rounded-control border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                  />
                </label>

                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    We usually reply within one business day.
                  </p>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Send message
                    <ArrowRight className="size-4" aria-hidden />
                  </button>
                </div>
              </form>
            </div>

            <div className="space-y-4">
              {quickFacts.map(({ icon: Icon, label, value }) => (
                <div key={label} className="surface-marketing-card p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className="chip-marketing-icon shrink-0">
                      <Icon className="size-4" aria-hidden />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase  text-muted-foreground">
                        {label}
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
                    </div>
                  </div>
                </div>
              ))}

              <div className="surface-marketing-card p-5 sm:p-6">
                <p className="text-[11px] font-semibold uppercase  text-muted-foreground">
                  We can help with
                </p>
                <ul className="mt-4 space-y-3 text-sm text-foreground">
                  {[
                    "Migration from legacy customer support stacks",
                    "WhatsApp automation and bot workflows",
                    "Enterprise security and compliance reviews",
                    "Multi-team rollout planning and onboarding",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Check className="size-3.5" aria-hidden />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-background">
        <div className="container-marketing py-16 md:py-20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
                Questions
              </span>
              <h2 className="text-marketing-title mt-4">
                Need a quick answer before you reach out?
              </h2>
            </div>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
            >
              Explore pricing <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {commonQuestions.map(({ title, body }) => (
              <article key={title} className="surface-marketing-card p-6">
                <h3 className="text-marketing-card-title">{title}</h3>
                <p className="text-marketing-card-body mt-3">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
