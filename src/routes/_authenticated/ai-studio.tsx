import { Link, createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { Sparkles, MessageSquare, FileText, Bot, Megaphone } from "lucide-react";
import { useBrandName } from "@/hooks/use-brand-name";

export const Route = createFileRoute("/_authenticated/ai-studio")({
  component: AIStudioPage,
});

const tools = [
  { icon: MessageSquare, title: "Reply suggestions", desc: "Context-aware reply drafting inside every conversation.", cta: "Configure model", to: "/api-config/ai" },
  { icon: FileText, title: "Auto-summarize threads", desc: "Instant summary + sentiment on any conversation.", cta: "Run on inbox", to: "/inbox" },
  { icon: Bot, title: "AI chatbot", desc: "24/7 auto-responder with tools + knowledge base grounding.", cta: "Open builder", to: "/chatbots" },
  { icon: Megaphone, title: "Campaign copy generator", desc: "Generate on-brand broadcast copy from a short brief.", cta: "Try it", to: "/campaigns" },
];

function AIStudioPage() {
  const brandName = useBrandName();
  return (
    <>
      <AppTopbar title="AI Studio" subtitle={`${brandName} AI · powered by your configured providers`} />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="rounded-control border border-accent/30 bg-gradient-hero text-primary-foreground p-8 shadow-elegant relative overflow-hidden">
          <div className="max-w-2xl relative z-10">
            <span className="inline-flex items-center gap-1.5 text-xs uppercase   text-accent-foreground/90 bg-accent/25 rounded-control px-3 py-1.5 backdrop-blur-sm">
              <Sparkles className="w-3 h-3" /> {brandName} AI
            </span>
            <h2 className="mt-4 font-bold text-white">Automate replies, summarize threads, and generate campaigns — all inside your CRM.</h2>
            <p className="mt-3 text-sm text-primary-foreground/80 max-w-lg">Four AI features tuned for WhatsApp conversations. Configure your preferred model provider in AI settings.</p>
          </div>
          <div className="absolute -right-16 -bottom-16 w-72 h-72 rounded-full bg-accent/40 blur-3xl" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((t) => (
            <div key={t.title} className="flex flex-col rounded-control border border-border bg-surface p-5 shadow-sm">
              <div className="w-10 h-10 rounded-control bg-accent/10 text-accent grid place-items-center"><t.icon className="w-4 h-4" /></div>
              <h3 className="mt-4 font-display font-semibold">{t.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t.desc}</p>
              {/* mt-auto pins the button to the card bottom so every row lines up. */}
              <div className="mt-auto pt-4">
              <Link
                to={t.to as never}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
              >
                {t.cta}
              </Link>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
