import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listTicketRelationships, linkTicketEntity, unlinkTicketEntity,
  searchLinkableEntities, getCustomerHistory, LINKABLE_ENTITIES,
  type LinkableEntity,
} from "@/lib/helpdesk/relationships.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link2, Plus, X, History } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const ENTITY_LABELS: Record<LinkableEntity, string> = {
  contact: "Contact", company: "Company", deal: "Deal", order: "Order",
  invoice: "Invoice", quote: "Quote", appointment: "Appointment",
  product: "Product", subscription: "Subscription", conversation: "Conversation",
  kb_article: "Knowledge Article", workflow: "Workflow", asset: "Asset / Device",
};

export function TicketRelationshipsPanel({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTicketRelationships);
  const linkFn = useServerFn(linkTicketEntity);
  const unlinkFn = useServerFn(unlinkTicketEntity);
  const historyFn = useServerFn(getCustomerHistory);

  const rel = useQuery({
    queryKey: ["ticket-relationships", ticketId],
    queryFn: () => listFn({ data: { ticketId } }),
  });
  const history = useQuery({
    queryKey: ["ticket-customer-history", ticketId],
    queryFn: () => historyFn({ data: { ticketId } }),
  });

  const unlink = useMutation({
    mutationFn: (linkId: string) => unlinkFn({ data: { linkId } }),
    onSuccess: () => {
      toast.success("Unlinked");
      qc.invalidateQueries({ queryKey: ["ticket-relationships", ticketId] });
    },
  });

  const link = useMutation({
    mutationFn: (v: { entityType: LinkableEntity; entityId: string }) =>
      linkFn({ data: { ticketId, ...v } }),
    onSuccess: () => {
      toast.success("Linked");
      qc.invalidateQueries({ queryKey: ["ticket-relationships", ticketId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to link"),
  });

  const grouped = (rel.data?.entities ?? []).reduce((acc: Record<string, any[]>, e: any) => {
    (acc[e.kind] ??= []).push(e);
    return acc;
  }, {});
  const linkIndex = new Map<string, string>();
  (rel.data?.links ?? []).forEach((l: any) => linkIndex.set(`${l.entity_type}:${l.entity_id}`, l.id));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Relationships
        </CardTitle>
        <AddLinkDialog ticketId={ticketId} onLink={(v) => link.mutate(v)} />
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="links">
          <TabsList className="w-full">
            <TabsTrigger value="links" className="flex-1">Links</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              <History className="h-3 w-3 " /> Customer History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="links" className="space-y-3 mt-3">
            {Object.keys(grouped).length === 0 && (
              <p className="text-xs text-muted-foreground">No linked records yet.</p>
            )}
            {Object.entries(grouped).map(([kind, items]) => (
              <div key={kind}>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {ENTITY_LABELS[kind as LinkableEntity]} ({items.length})
                </div>
                <div className="space-y-1">
                  {items.map((e) => {
                    const linkId = linkIndex.get(`${e.kind}:${e.id}`);
                    return (
                      <div key={e.id} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{e.label}</div>
                          {e.sub && <div className="truncate text-xs text-muted-foreground">{e.sub}</div>}
                        </div>
                        {linkId && (
                          <Button size="icon" variant="ghost" onClick={() => unlink.mutate(linkId)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="history" className="mt-3">
            {history.data?.contact ? (
              <div className="mb-2 rounded bg-muted/50 p-2 text-xs">
                <div className="font-medium">
                  {[history.data.contact.first_name, history.data.contact.last_name].filter(Boolean).join(" ") || "Customer"}
                </div>
                <div className="text-muted-foreground">
                  {history.data.contact.email ?? history.data.contact.phone ?? ""}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No contact linked to this ticket.</p>
            )}
            <ScrollArea className="h-[360px] pr-2">
              <div className="space-y-2">
                {(history.data?.timeline ?? []).map((t: any) => (
                  <div key={`${t.kind}-${t.id}`} className="flex items-start gap-2 border-l-2 pl-2">
                    <Badge variant="outline" className="text-[11px]">{t.kind}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{t.title}</div>
                      {t.sub && <div className="truncate text-xs text-muted-foreground">{t.sub}</div>}
                      <div className="text-[11px] text-muted-foreground">
                        {t.at ? formatDistanceToNow(new Date(t.at), { addSuffix: true }) : ""}
                      </div>
                    </div>
                  </div>
                ))}
                {(history.data?.timeline?.length ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground">No history yet.</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AddLinkDialog({
  ticketId,
  onLink,
}: {
  ticketId: string;
  onLink: (v: { entityType: LinkableEntity; entityId: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [entityType, setEntityType] = useState<LinkableEntity>("contact");
  const [q, setQ] = useState("");
  const searchFn = useServerFn(searchLinkableEntities);
  const results = useQuery({
    queryKey: ["link-search", ticketId, entityType, q],
    queryFn: () => searchFn({ data: { ticketId, entityType, query: q } }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7">
          <Plus className="h-3 w-3 " /> Link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Link a record</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={entityType} onValueChange={(v) => setEntityType(v as LinkableEntity)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LINKABLE_ENTITIES.map((k) => (
                <SelectItem key={k} value={k}>{ENTITY_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <ScrollArea className="h-[320px] pr-2">
            <div className="space-y-1">
              {(results.data ?? []).map((r: any) => (
                <button
                  key={r.id}
                  className="w-full rounded border px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onLink({ entityType, entityId: r.id });
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <div className="truncate font-medium">{r.label}</div>
                  {r.sub && <div className="truncate text-xs text-muted-foreground">{r.sub}</div>}
                </button>
              ))}
              {(results.data?.length ?? 0) === 0 && (
                <p className="p-2 text-xs text-muted-foreground">No matches.</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
