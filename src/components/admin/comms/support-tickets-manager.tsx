import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import { LifeBuoy, Search, Loader2, Lock, Send } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextarea } from "@/shared/components/rich-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  listTickets,
  getTicketDetail,
  replyTicket,
  updateTicket,
} from "@/lib/admin/communications.functions";

type Priority = "low" | "normal" | "high" | "urgent";
type Status = "open" | "pending" | "in_progress" | "resolved" | "closed";

interface Ticket {
  id: string;
  subject: string;
  description: string | null;
  category: string;
  priority: Priority;
  status: Status;
  organization_id: string | null;
  requester_id: string | null;
  assigned_to: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  updated_at: string;
  created_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  author_id: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
}

const priorityStyles: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-sky-500/10 text-sky-600",
  high: "bg-amber-500/10 text-amber-600",
  urgent: "bg-red-500/10 text-red-600",
};
const statusStyles: Record<Status, string> = {
  open: "bg-red-500/10 text-red-600",
  pending: "bg-amber-500/10 text-amber-600",
  in_progress: "bg-sky-500/10 text-sky-600",
  resolved: "bg-emerald-500/10 text-emerald-600",
  closed: "bg-muted text-muted-foreground",
};

const CATEGORIES = [
  "billing",
  "technical",
  "onboarding",
  "abuse",
  "feature_request",
  "other",
] as const;

export function SupportTicketsManager() {
  const fetchList = useServerFn(listTickets);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["platform_support_tickets", search, statusFilter],
    queryFn: () =>
      fetchList({
        data: {
          search: search || undefined,
          status: statusFilter.length ? statusFilter : undefined,
        },
      }),
  });

  const toggleStatus = (s: Status) =>
    setStatusFilter((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <>
      <div className="rounded-control border border-border bg-surface">
        <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-md min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets"
              className="pl-8 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {(["open", "pending", "in_progress", "resolved"] as const).map((s) => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`px-2 py-1 rounded-control border capitalize transition-colors ${
                  statusFilter.includes(s)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border hover:bg-muted"
                }`}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-4 py-2 font-medium">Ticket</th>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 inline animate-spin" /> Loading
                  </td>
                </tr>
              ) : (tickets as Ticket[]).length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    No tickets match your filters.
                  </td>
                </tr>
              ) : (
                (tickets as Ticket[]).map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                    onClick={() => setSelectedId(t.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{t.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <LifeBuoy className="w-3.5 h-3.5 text-muted-foreground" />
                      {t.subject}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{t.category}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-control text-xs capitalize ${priorityStyles[t.priority]}`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-control text-xs capitalize ${statusStyles[t.status]}`}
                      >
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <TicketDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}

function TicketDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getTicketDetail);
  const reply = useServerFn(replyTicket);
  const update = useServerFn(updateTicket);

  const { data, isLoading } = useQuery({
    queryKey: ["ticket_detail", id],
    queryFn: () => fetchDetail({ data: { id: id! } }),
    enabled: !!id,
  });

  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const mReply = useMutation({
    mutationFn: async () => reply({ data: { ticket_id: id!, body, is_internal: isInternal } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["ticket_detail", id] });
      qc.invalidateQueries({ queryKey: ["platform_support_tickets"] });
      toast.success(isInternal ? "Internal note added" : "Reply sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mUpdate = useMutation({
    mutationFn: async (patch: Record<string, unknown>) =>
      update({ data: { id: id!, ...patch } as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket_detail", id] });
      qc.invalidateQueries({ queryKey: ["platform_support_tickets"] });
    },
  });

  const ticket = data?.ticket as Ticket | undefined;
  const messages = useMemo(() => (data?.messages ?? []) as TicketMessage[], [data]);

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="w-4 h-4" />
            {isLoading ? "Loading" : (ticket?.subject ?? "Ticket")}
          </SheetTitle>
        </SheetHeader>
        {ticket && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground mb-1">Status</div>
                <Select value={ticket.status} onValueChange={(v) => mUpdate.mutate({ status: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["open", "pending", "in_progress", "resolved", "closed"] as Status[]).map(
                      (s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s.replace("_", " ")}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Priority</div>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => mUpdate.mutate({ priority: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["low", "normal", "high", "urgent"] as Priority[]).map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Category</div>
                <Select
                  value={ticket.category}
                  onValueChange={(v) => mUpdate.mutate({ category: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-control border border-border p-3 bg-muted/20">
              <div className="text-xs text-muted-foreground mb-1">Description</div>
              <div className="text-sm whitespace-pre-wrap">{ticket.description ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground mt-2">
                Opened {format(new Date(ticket.created_at), "PP p")}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium mb-2">Conversation</div>
              <div className="space-y-2">
                {messages.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">No messages yet.</div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-control border p-3 text-sm ${
                      m.is_internal
                        ? "bg-amber-500/5 border-amber-500/30"
                        : "bg-surface border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {m.is_internal && (
                        <Badge className="text-[11px] bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0">
                          <Lock className="w-3 h-3 " /> Internal note
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">{m.body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <RichTextarea
                rows={4}
                placeholder={isInternal ? "Internal note (staff only)" : "Reply to customer"}
                value={body}
                onChange={(v) => setBody(v)}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <Checkbox
                    id="internal-note"
                    checked={isInternal}
                    onCheckedChange={(v) => setIsInternal(v === true)}
                  />
                  <Label
                    htmlFor="internal-note"
                    className="flex items-center gap-1.5 font-normal text-xs cursor-pointer"
                  >
                    <Lock className="w-3 h-3" />
                    Internal note
                  </Label>
                </div>
                <Button
                  size="sm"
                  onClick={() => mReply.mutate()}
                  disabled={!body.trim() || mReply.isPending}
                  className="gap-1.5"
                >
                  {mReply.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {isInternal ? "Add note" : "Send reply"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
