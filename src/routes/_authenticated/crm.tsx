import { createFileRoute, useLocation, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useShareQuoteLink, copyText } from "@/hooks/use-quote-share";
import { useCreateLead } from "@/hooks/use-leads";
import { ContactsPage } from "./contacts.index";
import { LeadsPage } from "./leads.index";
import { useConversations } from "@/hooks/use-conversations";
import { platformBrandingQueryOptions } from "@/hooks/use-platform-branding";

export const Route = createFileRoute("/_authenticated/crm")({
  staticData: { breadcrumb: "CRM" },
  loader: ({ context }) => context.queryClient.ensureQueryData(platformBrandingQueryOptions()),
  head: ({ loaderData: brand }) => ({
    meta: [
      { title: `CRM — Contacts, Leads & Messaging | ${brand.name}` },
      {
        name: "description",
        content:
          "One CRM workspace for contacts, leads and customer messaging, with social leads landing straight in your inbox.",
      },
      { property: "og:title", content: `CRM — Contacts, Leads & Messaging | ${brand.name}` },
      {
        property: "og:description",
        content: "Manage contacts, qualify leads and reply to conversations from a single CRM tab.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CrmPage,
});

const TABS = ["contacts", "leads", "messaging"] as const;
type CrmTab = (typeof TABS)[number];

function CrmPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<CrmTab>("contacts");

  useEffect(() => {
    const hash = location.hash?.replace(/^#/, "") as CrmTab;
    if (TABS.includes(hash)) setTab(hash);
  }, [location.hash]);

  const onTabChange = (value: string) => {
    setTab(value as CrmTab);
    navigate({ to: "/crm", hash: value, replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={onTabChange} className="w-full">
      <div className="px-4 pt-4 md:px-6">
        <h1 className="text-xl font-semibold tracking-tight">CRM</h1>
        <p className="text-sm text-muted-foreground">
          Contacts, leads and messaging in one place — social leads land in your inbox
          automatically.
        </p>
        <TabsList className="mt-3">
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="messaging">Messaging</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="contacts" className="mt-0">
        <ContactsPage />
      </TabsContent>
      <TabsContent value="leads" className="mt-0">
        <LeadsPage />
      </TabsContent>
      <TabsContent value="messaging" className="mt-0">
        <CrmMessaging />
      </TabsContent>
    </Tabs>
  );
}

const SOCIAL_CHANNELS = new Set(["instagram", "messenger", "telegram", "webchat"]);

function CrmMessaging() {
  const { data, isLoading } = useConversations({ filter: "all", sort: "recent" });
  const rows = (data?.pages ?? []).flat().slice(0, 25);
  const [socialOnly, setSocialOnly] = useState(false);
  const visible = socialOnly ? rows.filter((c) => SOCIAL_CHANNELS.has(c.channel)) : rows;

  const createLead = useCreateLead();
  const shareQuote = useShareQuoteLink();
  const navigate = useNavigate();

  const captureLead = async (c: (typeof rows)[number]) => {
    try {
      await createLead.mutateAsync({
        first_name: (c.subject || "Social lead").slice(0, 80),
        source: "social",
        status: "new",
        notes: `Captured from ${c.channel} conversation${
          c.last_message_preview ? `: ${c.last_message_preview.slice(0, 200)}` : ""
        }`,
      });
      // Lead-to-quote: every captured social lead gets a draft quote with a
      // ready public link, so sales can reply with pricing immediately.
      let quoteUrl: string | null = null;
      try {
        const quote = await shareQuote.mutateAsync({
          title: `Quote — ${(c.subject || "Social lead").slice(0, 60)}`,
          notes: `Auto-generated from a ${c.channel} lead captured in the CRM.`,
        });
        quoteUrl = quote.url;
      } catch {
        // A quote failure must not lose the lead; surface it separately.
        toast.warning("Lead saved, but the quote could not be created");
      }

      if (quoteUrl) {
        const url = quoteUrl;
        await copyText(url);
        toast.success("Lead created with a quote link", {
          description: url,
          action: { label: "Open quote", onClick: () => window.open(url, "_blank", "noopener") },
        });
      } else {
        toast.success("Lead created", {
          action: { label: "Open Leads", onClick: () => navigate({ to: "/crm", hash: "leads" }) },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the lead");
    }
  };

  return (
    <div className="p-4 md:p-6">
      <Card className="divide-y">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <h2 className="font-medium">Recent conversations</h2>
            <p className="text-sm text-muted-foreground">
              Every channel, including leads captured from Social Studio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={socialOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setSocialOnly((v) => !v)}
            >
              Social leads only
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/inbox">Open Inbox</Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversations
          </div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No conversations yet.</div>
        ) : (
          visible.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/50"
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Link
                to="/inbox"
                search={{ conversationId: c.id }}
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {c.subject || c.last_message_preview || "Conversation"}
              </Link>
              <Badge variant="secondary" className="shrink-0 capitalize">
                {c.channel}
              </Badge>
              <Badge variant="outline" className="hidden shrink-0 capitalize sm:inline-flex">
                {c.status}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 gap-1"
                disabled={createLead.isPending}
                onClick={() => captureLead(c)}
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Add lead</span>
              </Button>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
