import { createFileRoute, Link } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getVisitor,
  mergeVisitorWithContact,
  searchContactsForMerge,
} from "@/lib/livechat/livechat.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  ArrowLeft,
  Globe,
  Monitor,
  MapPin,
  Clock,
  Languages,
  Link2,
  Loader2,
  User,
  Mail,
  Phone,
  Activity,
  MousePointerClick,
  FileText,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/livechat_/visitors/$visitorId")({
  head: () => ({ meta: [{ title: "Visitor · Live Chat" }] }),
  component: VisitorDetailPage,
});

interface VisitorFull {
  id: string;
  visitor_key: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  language: string | null;
  user_agent: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  first_seen_at: string;
  last_seen_at: string;
  visits_count: number;
  page_views: number;
  contact_id: string | null;
  first_referrer: string | null;
  last_referrer: string | null;
  first_page: string | null;
  last_page: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
}

interface EventRow {
  id: string;
  event_type: string;
  event_name: string | null;
  url: string | null;
  referrer: string | null;
  properties: Record<string, unknown> | null;
  created_at: string;
}

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
}

function VisitorDetailPage() {
  const { visitorId } = Route.useParams();
  const ws = useCurrentWorkspace();
  const workspaceId = ws.data?.id;

  const q = useQuery({
    queryKey: ["visitor", visitorId, workspaceId],
    queryFn: () => getVisitor({ data: { visitorId, workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 10_000,
  });

  const data = q.data as
    | {
        visitor: VisitorFull;
        events: EventRow[];
        contact: ContactRow | null;
        sessions: Array<{ id: string; status: string; started_at: string }>;
      }
    | null
    | undefined;

  return (
    <div className="flex h-full flex-col">
      <AppTopbar title="Visitor" subtitle="Complete visitor history and identification" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/livechat">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to visitors
            </Link>
          </Button>
        </div>
        {q.isLoading || !data ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <VisitorContent data={data} workspaceId={workspaceId!} />
        )}
      </div>
    </div>
  );
}

function VisitorContent({
  data,
  workspaceId,
}: {
  data: {
    visitor: VisitorFull;
    events: EventRow[];
    contact: ContactRow | null;
    sessions: Array<{ id: string; status: string; started_at: string }>;
  };
  workspaceId: string;
}) {
  const fmtZoned = useZonedDateFormatter();
  const { visitor: v, events, contact, sessions } = data;
  const returning = v.visits_count > 1;
  const known = !!v.contact_id;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: identity */}
      <div className="space-y-6 lg:col-span-1">
        <div className="rounded-control border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <div className="text-base font-semibold">
                {v.display_name ?? `Visitor ${v.visitor_key.slice(0, 6)}`}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {known ? <Badge>Known</Badge> : <Badge variant="secondary">Anonymous</Badge>}
                {returning && <Badge variant="secondary">Returning</Badge>}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={v.email} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={v.phone} />
            <InfoRow
              icon={<MapPin className="h-4 w-4" />}
              label="Location"
              value={[v.city, v.region, v.country].filter(Boolean).join(", ") || null}
            />
            <InfoRow icon={<Clock className="h-4 w-4" />} label="Timezone" value={v.timezone} />
            <InfoRow icon={<Languages className="h-4 w-4" />} label="Language" value={v.language} />
            <InfoRow
              icon={<Monitor className="h-4 w-4" />}
              label="Device"
              value={[v.browser, v.os, v.device].filter(Boolean).join(" · ") || null}
            />
            <InfoRow
              icon={<Globe className="h-4 w-4" />}
              label="IP"
              value={v.ip_address}
              monospace
            />
            <InfoRow
              icon={<Link2 className="h-4 w-4" />}
              label="Visitor key"
              value={v.visitor_key}
              monospace
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 text-sm">
            <Stat label="Visits" value={v.visits_count} />
            <Stat label="Page views" value={v.page_views} />
            <Stat
              label="First seen"
              value={formatDistanceToNow(new Date(v.first_seen_at), { addSuffix: true })}
            />
            <Stat
              label="Last seen"
              value={formatDistanceToNow(new Date(v.last_seen_at), { addSuffix: true })}
            />
          </div>
        </div>

        {/* Acquisition */}
        <div className="rounded-control border border-border p-5">
          <h3 className="text-sm font-semibold">Acquisition</h3>
          <div className="mt-3 space-y-2 text-sm">
            <InfoRow label="First referrer" value={v.first_referrer} />
            <InfoRow label="First page" value={v.first_page} />
            <InfoRow label="Last referrer" value={v.last_referrer} />
            <InfoRow label="Last page" value={v.last_page} />
            <InfoRow label="utm_source" value={v.utm_source} />
            <InfoRow label="utm_medium" value={v.utm_medium} />
            <InfoRow label="utm_campaign" value={v.utm_campaign} />
            <InfoRow label="utm_term" value={v.utm_term} />
            <InfoRow label="utm_content" value={v.utm_content} />
          </div>
        </div>

        {/* Contact link / merge */}
        <div className="rounded-control border border-border p-5">
          <h3 className="text-sm font-semibold">CRM contact</h3>
          {contact ? (
            <div className="mt-3 text-sm">
              <div className="font-medium">{contact.name ?? contact.email ?? contact.phone}</div>
              <div className="text-muted-foreground">
                {contact.email} {contact.phone && `· ${contact.phone}`}
              </div>
              <Button size="sm" variant="outline" className="mt-3" asChild>
                <Link to="/contacts">Open in CRM</Link>
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-muted-foreground">
                This visitor is not linked to a CRM contact yet.
              </p>
              <MergeDialog visitorId={v.id} workspaceId={workspaceId} />
            </div>
          )}
        </div>
      </div>

      {/* Right: sessions + timeline */}
      <div className="space-y-6 lg:col-span-2">
        <div className="rounded-control border border-border p-5">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Chat sessions</h3>
            <Badge variant="secondary" className="ml-2">
              {sessions.length}
            </Badge>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chat sessions yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-control border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={s.status === "active" ? "default" : "secondary"}>
                      {s.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      {fmtZoned(new Date(s.started_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-control border border-border p-5">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Activity timeline</h3>
            <Badge variant="secondary" className="ml-2">
              {events.length}
            </Badge>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-6">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
                    <MousePointerClick className="h-3 w-3 text-muted-foreground" />
                  </span>
                  <div className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">
                        {e.event_name ?? e.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {e.url && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{e.url}</div>
                    )}
                    {e.referrer && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        from {e.referrer}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  monospace,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null;
  monospace?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`truncate ${monospace ? "font-mono text-xs" : ""}`}>{value ?? "—"}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function MergeDialog({ visitorId, workspaceId }: { visitorId: string; workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const qc = useQueryClient();

  const results = useQuery({
    queryKey: ["merge-contacts", workspaceId, query],
    queryFn: () => searchContactsForMerge({ data: { workspaceId, query } }),
    enabled: open,
  });

  const merge = useMutation({
    mutationFn: (contactId: string) =>
      mergeVisitorWithContact({ data: { visitorId, workspaceId, contactId } }),
    onSuccess: () => {
      toast.success("Visitor merged with contact");
      qc.invalidateQueries({ queryKey: ["visitor", visitorId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Link2 className="mr-2 h-4 w-4" />
          Merge with contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge visitor with CRM contact</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or phone"
            className="pl-8"
          />
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {results.isLoading && (
            <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-muted-foreground" />
          )}
          {(results.data ?? []).length === 0 && !results.isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">No contacts found.</p>
          )}
          {((results.data ?? []) as ContactRow[]).map((c) => (
            <button
              key={c.id}
              disabled={merge.isPending}
              onClick={() => merge.mutate(c.id)}
              className="flex w-full items-center justify-between rounded-control border border-border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name ?? c.email ?? c.phone}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[c.email, c.phone].filter(Boolean).join(" · ")}
                </div>
              </div>
              <Badge variant="secondary">Merge</Badge>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
