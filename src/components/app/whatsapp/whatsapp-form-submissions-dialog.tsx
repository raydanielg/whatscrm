import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Inbox, Loader2, User2, Search, ChevronRight, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

type SubmissionRow = {
  id: string;
  form_id: string;
  contact_name: string | null;
  contact_wa_id: string | null;
  received_at: string;
  created_at: string;
  response_data: Record<string, unknown> | null;
};

function deriveStatus(response: Record<string, unknown> | null): {
  label: string;
  tone: "default" | "success" | "warning" | "destructive";
} {
  const raw = (response?.status ?? response?.state) as string | undefined;
  const key = (raw ?? "received").toString().toLowerCase();
  if (["completed", "complete", "success", "submitted"].includes(key))
    return { label: "Completed", tone: "success" };
  if (["failed", "error", "rejected"].includes(key))
    return { label: "Failed", tone: "destructive" };
  if (["partial", "pending", "in_progress"].includes(key))
    return { label: "Partial", tone: "warning" };
  return { label: "Received", tone: "default" };
}

function toneClass(tone: "default" | "success" | "warning" | "destructive") {
  switch (tone) {
    case "success":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    case "warning":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20";
    case "destructive":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "";
  }
}

function safeDistanceToNow(dateStr: string | null | undefined): string {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "unknown";
  return formatDistanceToNow(d, { addSuffix: true });
}

function extractMessage(response: Record<string, unknown> | null): string {
  if (!response) return "";
  const preferred = ["message", "body", "text", "response", "answer", "comment"];
  for (const key of preferred) {
    const v = response[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // Fallback: concatenate the first few string fields.
  const entries = Object.entries(response)
    .filter(([, v]) => typeof v === "string" && (v as string).trim())
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`);
  return entries.join(" · ");
}

export function WhatsAppFormSubmissionsDialog({
  open,
  onOpenChange,
  formId,
  formName,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formId: string | null;
  formName: string | null;
  workspaceId: string | undefined;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const submissions = useQuery({
    queryKey: ["wa-form-submissions", formId, workspaceId],
    enabled: open && !!formId && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_form_submissions")
        .select("id,form_id,contact_name,contact_wa_id,received_at,created_at,response_data")
        .eq("form_id", formId!)
        .eq("workspace_id", workspaceId!)
        .order("received_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as SubmissionRow[];
    },
  });

  const filtered = useMemo(() => {
    const list = submissions.data ?? [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((s) => {
      const msg = extractMessage(s.response_data).toLowerCase();
      return (
        (s.contact_name ?? "").toLowerCase().includes(q) ||
        (s.contact_wa_id ?? "").toLowerCase().includes(q) ||
        msg.includes(q)
      );
    });
  }, [submissions.data, query]);

  // Only auto-select the first row when no selection has been made yet.
  // When the user is searching, do not silently jump to filtered[0].
  const selected =
    filtered.find((s) => s.id === selectedId) ?? (selectedId ? null : (filtered[0] ?? null));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setQuery("");
          setSelectedId(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" />
            Submissions
            {formName && <span className="text-muted-foreground font-normal">· {formName}</span>}
          </DialogTitle>
          <DialogDescription>
            Every response received from this WhatsApp form, newest first.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] min-h-[440px] max-h-[70vh]">
          <div className="border-r border-border flex flex-col min-h-0">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search contact or message"
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {submissions.isLoading ? (
                <div className="p-6 text-xs text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading
                </div>
              ) : submissions.isError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto text-destructive mb-2" />
                  <div className="text-xs text-destructive">Failed to load submissions</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {submissions.error instanceof Error
                      ? submissions.error.message
                      : "Unknown error"}
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center">
                  <Inbox className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <div className="text-xs text-muted-foreground">
                    {submissions.data?.length ? "No matches" : "No submissions yet"}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((s) => {
                    const status = deriveStatus(s.response_data);
                    const isActive = (selected?.id ?? null) === s.id;
                    const msg = extractMessage(s.response_data);
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedId(s.id)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-muted transition-colors ${
                          isActive ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <User2 className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate">
                              {s.contact_name || s.contact_wa_id || "Anonymous"}
                            </span>
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        </div>
                        {msg && (
                          <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                            {msg}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge
                            variant="outline"
                            className={`text-[11px] h-4 px-1.5 ${toneClass(status.tone)}`}
                          >
                            {status.label}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {safeDistanceToNow(s.received_at)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="min-h-0 flex flex-col">
            {selected ? (
              <SubmissionDetail submission={selected} />
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <div>
                  <Inbox className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <div className="text-xs text-muted-foreground">
                    Select a submission to view its details.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SubmissionDetail({ submission }: { submission: SubmissionRow }) {
  const status = deriveStatus(submission.response_data);
  const entries = Object.entries(submission.response_data ?? {});
  const formatZoned = useZonedDateFormatter();

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-medium">
              {submission.contact_name || submission.contact_wa_id || "Anonymous"}
            </div>
            <Badge variant="outline" className={`text-[11px] ${toneClass(status.tone)}`}>
              {status.label}
            </Badge>
          </div>
          {submission.contact_wa_id && (
            <div className="text-[11px] text-muted-foreground font-mono">
              {submission.contact_wa_id}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-4">
            <span>
              Received{" "}
              {submission.received_at && !isNaN(new Date(submission.received_at).getTime())
                ? formatZoned(new Date(submission.received_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "unknown"}
            </span>
            <span>{safeDistanceToNow(submission.received_at)}</span>
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase text-muted-foreground mb-2">
            Response fields
          </div>
          {entries.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No response data captured.</div>
          ) : (
            <div className="rounded-control border border-border divide-y divide-border">
              {entries.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2 text-xs">
                  <div className="text-muted-foreground font-mono truncate">{k}</div>
                  <div className="break-words whitespace-pre-wrap">
                    {typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                      ? String(v)
                      : JSON.stringify(v, null, 2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
