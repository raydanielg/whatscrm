import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AtSign, CheckCircle2, ChevronDown, Filter, MessageSquare, Paperclip, Pencil,
  Phone, Pin, PinOff, Search, Send, Sparkles, Tag, Trash2, UserPlus, Zap, FileText, Mail,
  Calendar, RefreshCw, Plus, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  useMergedTimeline, useTimelineRealtime, useCreateNote, useUpdateNote, useDeleteNote,
  useUploadAttachment, getAttachmentUrl, verbCategory, formatVerb,
  type TimelineEntity, type TimelineItem, type NoteRow, type ActivityRow, type AttachmentRow,
} from "@/hooks/use-activity-timeline";
import { useCurrentWorkspace, useWorkspaceMembers } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type Props = {
  entityType: TimelineEntity;
  entityId: string;
  compact?: boolean;
};

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  created:    { label: "Created",     icon: Plus,          color: "bg-emerald-500/10 text-emerald-500" },
  updated:    { label: "Updated",     icon: RefreshCw,     color: "bg-slate-500/10 text-slate-400" },
  note:       { label: "Notes",       icon: FileText,      color: "bg-amber-500/10 text-amber-500" },
  assigned:   { label: "Assignments", icon: UserPlus,      color: "bg-blue-500/10 text-blue-500" },
  status:     { label: "Status",      icon: CheckCircle2,  color: "bg-indigo-500/10 text-indigo-400" },
  tag:        { label: "Tags",        icon: Tag,           color: "bg-fuchsia-500/10 text-fuchsia-400" },
  message:    { label: "Messages",    icon: MessageSquare, color: "bg-sky-500/10 text-sky-400" },
  call:       { label: "Calls",       icon: Phone,         color: "bg-green-500/10 text-green-400" },
  email:      { label: "Emails",      icon: Mail,          color: "bg-cyan-500/10 text-cyan-400" },
  meeting:    { label: "Meetings",    icon: Calendar,      color: "bg-violet-500/10 text-violet-400" },
  task:       { label: "Tasks",       icon: CheckCircle2,  color: "bg-orange-500/10 text-orange-400" },
  campaign:   { label: "Campaigns",   icon: Send,          color: "bg-pink-500/10 text-pink-400" },
  ai:         { label: "AI actions",  icon: Sparkles,      color: "bg-purple-500/10 text-purple-400" },
  automation: { label: "Automations", icon: Zap,           color: "bg-yellow-500/10 text-yellow-400" },
  generic:    { label: "Other",       icon: Activity,      color: "bg-muted text-muted-foreground" },
};

const ALL_CATS = Object.keys(CATEGORY_META);

export function ActivityTimeline({ entityType, entityId, compact }: Props) {
  useTimelineRealtime(entityType, entityId);
  const { items, notes, isLoading } = useMergedTimeline(entityType, entityId);
  const { data: ws } = useCurrentWorkspace();
  const { data: members } = useWorkspaceMembers(ws?.id);
  const memberById = useMemo(() => {
    const m = new Map<string, { display_name: string | null; avatar_url: string | null; email: string | null }>();
    for (const x of members ?? []) m.set(x.user_id, x);
    return m;
  }, [members]);

  const [search, setSearch] = useState("");
  const [enabledCats, setEnabledCats] = useState<Set<string>>(new Set(ALL_CATS));

  const pinned = useMemo(() => notes.filter((n) => n.is_pinned), [notes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      const cat =
        it.kind === "note" ? "note"
        : it.kind === "activity" ? verbCategory(it.data.verb)
        : "generic";
      if (!enabledCats.has(cat)) return false;
      if (!q) return true;
      if (it.kind === "note") return it.data.body.toLowerCase().includes(q);
      if (it.kind === "activity") return (it.data.summary ?? it.data.verb).toLowerCase().includes(q);
      if (it.kind === "attachment") return (it.data.file?.name ?? "").toLowerCase().includes(q);
      return false;
    });
  }, [items, search, enabledCats]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div className="rounded-control border border-border bg-surface overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 mr-auto">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">Activity timeline</h3>
          <Badge variant="outline" className="text-[11px]">{items.length}</Badge>
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes & activity" className="pl-8 h-9 text-xs" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-9">
              <Filter className="w-3.5 h-3.5 mr-1.5" /> Filter <ChevronDown className="w-3 h-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Show categories</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_CATS.map((c) => (
              <DropdownMenuCheckboxItem
                key={c}
                checked={enabledCats.has(c)}
                onCheckedChange={(v) => {
                  setEnabledCats((s) => {
                    const n = new Set(s);
                    if (v) n.add(c); else n.delete(c);
                    return n;
                  });
                }}
              >
                {CATEGORY_META[c].label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NoteComposer entityType={entityType} entityId={entityId} />

      {pinned.length > 0 && (
        <div className="p-4 border-b border-border bg-amber-500/5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500 uppercase tracking-wide">
            <Pin className="w-3 h-3" /> Pinned
          </div>
          {pinned.map((n) => (
            <NoteCard key={n.id} note={n} memberById={memberById} />
          ))}
        </div>
      )}

      <div className={cn("relative", compact ? "max-h-[520px] overflow-y-auto" : "")}>
        {isLoading && <div className="p-6 text-xs text-muted-foreground">Loading timeline</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No activity yet. Add a note to get started.
          </div>
        )}

        {grouped.map(([day, group]) => (
          <div key={day} className="relative">
            <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur px-4 py-1.5 text-[11px] font-medium  text-muted-foreground border-b border-border">
              {day}
            </div>
            <ol className="relative">
              <div className="absolute left-[27px] top-0 bottom-0 w-px bg-border" aria-hidden />
              {group.map((it) => (
                <TimelineNode key={itemKey(it)} item={it} memberById={memberById} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- Timeline node ---------------------------- */

function TimelineNode({
  item,
  memberById,
}: {
  item: TimelineItem;
  memberById: Map<string, { display_name: string | null; avatar_url: string | null; email: string | null }>;
}) {
  if (item.kind === "note") {
    return (
      <li className="relative pl-12 pr-4 py-3">
        <NodeBubble category="note" />
        <NoteCard note={item.data} memberById={memberById} />
      </li>
    );
  }
  if (item.kind === "attachment") {
    const a = item.data;
    return (
      <li className="relative pl-12 pr-4 py-3">
        <NodeBubble category="generic" icon={Paperclip} />
        <AttachmentCard att={a} memberById={memberById} />
      </li>
    );
  }
  const act = item.data;
  const cat = verbCategory(act.verb);
  const meta = CATEGORY_META[cat];
  const actor = act.actor_id ? memberById.get(act.actor_id) : null;
  return (
    <li className="relative pl-12 pr-4 py-2.5">
      <NodeBubble category={cat} />
      <div className="flex items-start gap-2 text-sm">
        <div className="flex-1 min-w-0">
          <p className="leading-tight">
            <span className="font-medium">{actor?.display_name ?? (act.actor_id ? "User" : "System")}</span>{" "}
            <span className="text-muted-foreground">{formatVerb(act.verb, act.summary)}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{fmtTime(act.created_at)} · {meta.label}</p>
        </div>
      </div>
    </li>
  );
}

function NodeBubble({ category, icon }: { category: string; icon?: React.ComponentType<{ className?: string }> }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.generic;
  const Icon = icon ?? meta.icon;
  return (
    <span
      className={cn(
        "absolute left-[15px] top-3 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-surface",
        meta.color,
      )}
    >
      <Icon className="w-3 h-3" />
    </span>
  );
}

/* ------------------------------- Notes -------------------------------- */

function NoteCard({
  note,
  memberById,
}: {
  note: NoteRow;
  memberById: Map<string, { display_name: string | null; avatar_url: string | null; email: string | null }>;
}) {
  const { user } = useAuth();
  const author = note.author_id ? memberById.get(note.author_id) : null;
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const canEdit = user?.id && user.id === note.author_id;

  return (
    <div className="rounded-control border border-border bg-background p-3 group">
      <div className="flex items-start gap-2">
        <Avatar className="w-7 h-7 shrink-0">
          {author?.avatar_url && <AvatarImage src={author.avatar_url} />}
          <AvatarFallback className="text-[11px]">
            {(author?.display_name ?? author?.email ?? "?").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="font-medium">{author?.display_name ?? author?.email ?? "Unknown"}</span>
            <span className="text-muted-foreground">· {fmtTime(note.created_at)}</span>
            {note.updated_at !== note.created_at && <span className="text-muted-foreground italic">(edited)</span>}
            {note.is_pinned && <Badge variant="outline" className="text-[11px] gap-1"><Pin className="w-3 h-3" />Pinned</Badge>}
          </div>
          {editing ? (
            <div className="mt-2 space-y-2">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="text-sm" />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setBody(note.body); }}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    await updateNote.mutateAsync({ id: note.id, body, mentions: extractMentions(body, undefined) });
                    setEditing(false);
                    toast.success("Note updated");
                  }}
                >Save</Button>
              </div>
            </div>
          ) : (
            <div className="mt-1 text-sm whitespace-pre-wrap break-words">
              <RenderNoteBody body={note.body} mentions={note.mentions} memberById={memberById} />
            </div>
          )}
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => updateNote.mutate({ id: note.id, is_pinned: !note.is_pinned })}>
            {note.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </Button>
          {canEdit && !editing && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {canEdit && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
              onClick={async () => {
                await deleteNote.mutateAsync({ id: note.id, entity_type: note.entity_type as TimelineEntity, entity_id: note.entity_id });
                toast.success("Note deleted");
              }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function RenderNoteBody({
  body, mentions, memberById,
}: {
  body: string;
  mentions: string[];
  memberById: Map<string, { display_name: string | null; avatar_url: string | null; email: string | null }>;
}) {
  // Replace @[Name](uuid) with a badge; also highlight plain @Name occurrences.
  const parts: (string | { id: string; label: string })[] = [];
  const rx = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push({ id: m[2], label: m[1] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string"
          ? <span key={i}>{p}</span>
          : (
            <span key={i} className="inline-flex items-center gap-1 rounded bg-accent/10 text-accent px-1 text-base font-medium">
              <AtSign className="w-3 h-3" />
              {memberById.get(p.id)?.display_name ?? p.label}
            </span>
          )
      )}
    </>
  );
}

/* ---------------------------- Composer -------------------------------- */

function NoteComposer({ entityType, entityId }: { entityType: TimelineEntity; entityId: string }) {
  const { data: ws } = useCurrentWorkspace();
  const { data: members } = useWorkspaceMembers(ws?.id);
  const create = useCreateNote();
  const upload = useUploadAttachment();
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return (members ?? [])
      .filter((m) => (m.display_name ?? m.email ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, members]);

  function handleChange(v: string) {
    setBody(v);
    const caret = ref.current?.selectionStart ?? v.length;
    const upTo = v.slice(0, caret);
    const match = upTo.match(/@(\w{0,30})$/);
    setMentionQuery(match ? match[1] : null);
  }

  function insertMention(id: string, name: string) {
    const ta = ref.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const upTo = body.slice(0, caret);
    const rest = body.slice(caret);
    const replaced = upTo.replace(/@(\w{0,30})$/, `@[${name}](${id}) `);
    const next = replaced + rest;
    setBody(next);
    setMentionQuery(null);
    setTimeout(() => ta.focus(), 0);
  }

  async function submit() {
    if (!body.trim()) return;
    const mentions = extractMentions(body);
    const note = await create.mutateAsync({
      entity_type: entityType,
      entity_id: entityId,
      body: body.trim(),
      mentions,
      is_pinned: pinned,
    });
    setBody("");
    setPinned(false);
    toast.success("Note added");
    return note;
  }

  async function handleFile(f: File) {
    setUploading(true);
    try {
      await upload.mutateAsync({ entity_type: entityType, entity_id: entityId, file: f });
      toast.success(`Attached ${f.name}`);
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-4 border-b border-border">
      <div className="rounded-control border border-border focus-within:ring-2 focus-within:ring-accent/40 bg-background">
        <Textarea
          ref={ref}
          value={body}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Write a note use @ to mention a teammate"
          rows={3}
          className="border-0 resize-none focus-visible:ring-0 shadow-none"
        />
        {mentionQuery !== null && filteredMembers.length > 0 && (
          <div className="border-t border-border p-1 bg-popover">
            {filteredMembers.map((m) => (
              <button
                key={m.user_id}
                onClick={() => insertMention(m.user_id, m.display_name ?? m.email ?? "user")}
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/10 text-left text-sm"
              >
                <Avatar className="w-5 h-5">
                  {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                  <AvatarFallback className="text-[11px]">{(m.display_name ?? m.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="truncate">{m.display_name ?? m.email}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 border-t border-border p-1.5">
          <Button size="sm" variant="ghost" className="h-7" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Paperclip className="w-3.5 h-3.5 " /> Attach
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }} />
          <Button size="sm" variant={pinned ? "default" : "ghost"} className="h-7" onClick={() => setPinned((p) => !p)}>
            <Pin className="w-3.5 h-3.5 " /> {pinned ? "Pinned" : "Pin"}
          </Button>
          <div className="ml-auto">
            <Button size="sm" className="h-7" onClick={submit} disabled={!body.trim() || create.isPending}>
              <Send className="w-3.5 h-3.5 " /> Post
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Attachment card --------------------------- */

function AttachmentCard({
  att,
  memberById,
}: {
  att: AttachmentRow;
  memberById: Map<string, { display_name: string | null; avatar_url: string | null; email: string | null }>;
}) {
  const uploader = att.attached_by ? memberById.get(att.attached_by) : null;
  const [busy, setBusy] = useState(false);

  async function open() {
    if (!att.file) return;
    setBusy(true);
    const url = await getAttachmentUrl(att.file.bucket, att.file.path);
    setBusy(false);
    if (url) window.open(url, "_blank");
    else toast.error("Could not generate link");
  }

  return (
    <div className="rounded-control border border-border bg-background p-3 flex items-center gap-3 text-sm">
      <div className="w-8 h-8 rounded bg-accent/10 text-accent flex items-center justify-center">
        <Paperclip className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{att.file?.name ?? "File"}</p>
        <p className="text-[11px] text-muted-foreground">
          {uploader?.display_name ?? "Someone"} · {fmtTime(att.created_at)} · {formatBytes(att.file?.size_bytes ?? 0)}
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={open} disabled={busy}>
        <Download className="w-3.5 h-3.5 " /> Open
      </Button>
    </div>
  );
}

/* -------------------------------- Utils ------------------------------- */

function itemKey(it: TimelineItem) {
  return `${it.kind}:${(it.data as { id: string }).id}`;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function groupByDay(items: TimelineItem[]) {
  const map = new Map<string, TimelineItem[]>();
  for (const it of items) {
    const d = new Date(it.at);
    const key = d.toDateString();
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  const today = new Date().toDateString();
  const yest = new Date(Date.now() - 86400000).toDateString();
  return Array.from(map.entries()).map(([k, v]) => {
    const label = k === today ? "Today" : k === yest ? "Yesterday" : new Date(k).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    return [label, v] as const;
  });
}
function formatBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}
function extractMentions(body: string, _extraIds?: string[]) {
  const ids = new Set<string>();
  const rx = /@\[[^\]]+\]\(([0-9a-f-]{36})\)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(body)) !== null) ids.add(m[1]);
  return Array.from(ids);
}
