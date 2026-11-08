/**
 * Social Studio: post history (every scheduled/published post with channel,
 * time and status) and the reusable post library.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, ExternalLink, Plus, Pencil, Trash2, Copy, Loader2 } from "lucide-react";
import {
  PLATFORM_LABELS,
  CONTENT_TYPE_LABELS,
  type SocialPost,
  type SocialPostStatus,
  type SocialChannel,
} from "@/hooks/use-social-publishing";
import {
  usePostLibrary,
  useSaveLibraryItem,
  useDeleteLibraryItem,
  useMarkLibraryUsed,
  type LibraryItem,
} from "@/hooks/use-post-library";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-primary/10 text-primary",
  publishing: "bg-amber-500/15 text-amber-600",
  published: "bg-emerald-500/15 text-emerald-600",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

/** Full history of posts: channel, time and status per row. */
export function PostHistory({
  posts,
  channels,
  isLoading,
  onOpenPost,
}: {
  posts: SocialPost[];
  channels: SocialChannel[];
  isLoading: boolean;
  onOpenPost: (p: SocialPost) => void;
}) {
  const [status, setStatus] = useState<"all" | SocialPostStatus>("all");
  const [channelId, setChannelId] = useState<"all" | string>("all");
  const [q, setQ] = useState("");
  const formatZoned = useZonedDateFormatter();
  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    return formatZoned(new Date(iso), {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return posts
      .filter((p) => (status === "all" ? true : p.status === status))
      .filter((p) =>
        channelId === "all"
          ? true
          : (p.social_post_targets ?? []).some((t) => t.channel_id === channelId),
      )
      .filter((p) => (term ? p.caption.toLowerCase().includes(term) : true))
      .sort(
        (a, b) =>
          new Date(b.published_at ?? b.scheduled_at ?? b.created_at).getTime() -
          new Date(a.published_at ?? a.scheduled_at ?? a.created_at).getTime(),
      );
  }, [posts, status, channelId, q]);

  if (isLoading)
    return <Card className="p-10 text-center text-muted-foreground">Loading history</Card>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search captions"
          className="max-w-xs"
          aria-label="Search post history"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {["all", "draft", "scheduled", "publishing", "published", "failed", "cancelled"].map(
              (s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Select value={channelId} onValueChange={setChannelId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} · {PLATFORM_LABELS[c.platform]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {rows.length} post{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {rows.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <History className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">No posts match these filters</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Post</th>
                <th className="text-left font-medium px-3 py-2">Channels</th>
                <th className="text-left font-medium px-3 py-2">Scheduled</th>
                <th className="text-left font-medium px-3 py-2">Published</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t align-top">
                  <td className="px-3 py-2 max-w-[280px]">
                    <p className="line-clamp-2 break-words">
                      {p.caption || <span className="text-muted-foreground">No caption</span>}
                    </p>
                    <Badge variant="secondary" className="mt-1 text-[11px]">
                      {CONTENT_TYPE_LABELS[p.content_type]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(p.social_post_targets ?? []).length === 0 && (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                      {(p.social_post_targets ?? []).map((t) => (
                        <Badge key={t.id} variant="outline" className="text-[11px] gap-1">
                          {t.social_channels?.name ?? "Channel"}
                          <span className="text-muted-foreground">· {t.status}</span>
                          {t.permalink && (
                            <a
                              href={t.permalink}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Open published post"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {fmt(p.scheduled_at)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {fmt(p.published_at)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`capitalize ${STATUS_CLASS[p.status]}`}>
                      {p.status}
                    </Badge>
                    {p.last_error && (
                      <p className="text-xs text-destructive mt-1 max-w-[220px]">{p.last_error}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label="Open post"
                      onClick={() => onOpenPost(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

const emptyItem: LibraryItem = {
  id: "",
  workspace_id: "",
  name: "",
  caption: "",
  media_urls: [],
  link_url: "",
  first_comment: "",
  content_type: "post",
  media_kind: "none",
  poll_options: [],
  poll_duration: 24,
  allow_multi_vote: false,
  tags: [],
  use_count: 0,
  created_at: "",
  updated_at: "",
};

/** Saved drafts that can be reused across many scheduled posts. */
export function PostLibrary({ onUse }: { onUse: (item: LibraryItem) => void }) {
  const { data: items = [], isLoading } = usePostLibrary();
  const save = useSaveLibraryItem();
  const remove = useDeleteLibraryItem();
  const markUsed = useMarkLibraryUsed();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LibraryItem>(emptyItem);
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) => i.name.toLowerCase().includes(term) || i.caption.toLowerCase().includes(term),
    );
  }, [items, q]);

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error("Give this draft a name");
      return;
    }
    try {
      await save.mutateAsync({ ...draft, id: draft.id || undefined, name: draft.name.trim() });
      toast.success(draft.id ? "Draft updated" : "Draft saved to library");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save draft");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search library"
          className="max-w-xs"
          aria-label="Search post library"
        />
        <Button
          className="ml-auto"
          onClick={() => {
            setDraft(emptyItem);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New draft
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-10 text-center text-muted-foreground">Loading library</Card>
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Copy className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">No saved drafts yet</p>
          <p className="text-sm text-muted-foreground">
            Save evergreen copy here and reuse it on any channel.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <Card key={item.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Used {item.use_count} time{item.use_count === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[11px]">
                  {CONTENT_TYPE_LABELS[item.content_type]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap break-words">
                {item.caption || "No caption"}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => {
                    onUse(item);
                    void markUsed.mutateAsync(item).catch(() => undefined);
                  }}
                >
                  <Copy className="h-3.5 w-3.5 " />
                  Use in composer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDraft(item);
                    setOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 " />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 ml-auto"
                  aria-label={`Delete ${item.name}`}
                  onClick={async () => {
                    try {
                      await remove.mutateAsync(item.id);
                      toast.success("Draft deleted");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not delete draft");
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit draft" : "New draft"}</DialogTitle>
            <DialogDescription>
              Saved drafts can be copied into the composer and scheduled on any channel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lib-name">Name</Label>
              <Input
                id="lib-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Weekly promo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lib-caption">Caption</Label>
              <Textarea
                id="lib-caption"
                rows={6}
                value={draft.caption}
                onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lib-link">Link (optional)</Label>
              <Input
                id="lib-link"
                value={draft.link_url ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, link_url: e.target.value }))}
                placeholder="https://"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lib-media">Media URLs (comma separated)</Label>
              <Input
                id="lib-media"
                value={(draft.media_urls ?? []).join(", ")}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    media_urls: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    media_kind: e.target.value.trim()
                      ? d.media_kind === "none"
                        ? "image"
                        : d.media_kind
                      : "none",
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
