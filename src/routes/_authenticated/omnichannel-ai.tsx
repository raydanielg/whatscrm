import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { AIOmnichannelPanel } from "@/components/app/omnichannel/ai-omnichannel-panel";
import { AppTopbar } from "@/components/app/app-topbar";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Card } from "@/components/ui/card";


const searchSchema = z.object({
  contactId: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/omnichannel-ai")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Omnichannel AI" },
      { name: "description", content: "AI that understands every customer conversation across every channel." },
    ],
  }),
  component: OmnichannelAIPage,
  errorComponent: ({ error }) => <div role="alert" className="p-6 text-sm text-destructive">{(error as Error).message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Not found.</div>,
});

interface ContactRow { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; }

function OmnichannelAIPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selected, setSelected] = useState<ContactRow | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const rows = (data ?? []) as ContactRow[];
        setContacts(rows);
        if (search.contactId) {
          const hit = rows.find((r) => r.id === search.contactId);
          if (hit) setSelected(hit);
        }
      });
  }, [workspaceId, search.contactId]);

  const pick = (c: ContactRow) => {
    setSelected(c);
    navigate({ search: { contactId: c.id } });
  };

  return (
    <>
      <AppTopbar
        title="Omnichannel AI"
        subtitle="One AI brain that understands every conversation across every channel"
      />
      <main className="flex-1 flex flex-col min-h-0">


      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 p-4 min-h-0">
        <Card className="flex flex-col min-h-0 border-0">
          <Command className="flex-1">
            <CommandInput placeholder="Search customer" />
            <CommandList className="max-h-none p-4">
              <CommandEmpty>No customers.</CommandEmpty>
              {contacts.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || "Unknown";
                return (
                  <CommandItem
                    key={c.id}
                    value={`${name} ${c.email ?? ""} ${c.phone ?? ""}`}
                    onSelect={() => pick(c)}
                    className={selected?.id === c.id ? "mb-2 bg-muted" : "mb-2"}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm">{name}</span>
                      {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </Card>

        <div className="min-h-0">
          {workspaceId && selected ? (
            <AIOmnichannelPanel
              workspaceId={workspaceId}
              contactId={selected.id}
              contactName={[selected.first_name, selected.last_name].filter(Boolean).join(" ") || selected.email || undefined}
            />
          ) : (
            <Card className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Select a customer to see their omnichannel AI insights.
            </Card>
          )}
        </div>
      </div>
      </main>
    </>

  );
}

