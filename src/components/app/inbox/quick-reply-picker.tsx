/**
 * Quick-reply picker for the Inbox composer: search/browse saved canned
 * responses and insert one into the composer at the caret position. Also
 * doubles as the "save current draft as a quick reply" entry point.
 *
 * Modeled on product-picker.tsx (dialog + search + list + insert action).
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquareText, Plus, Search, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listQuickReplies,
  createQuickReply,
  bumpQuickReplyUsage,
  type QuickReply,
} from "@/lib/inbox/quick-replies.functions";

export interface QuickReplyPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Called with the body text to insert into the composer. */
  onInsert: (body: string) => void;
  /** Prefilled when opened via "save current draft" — prompts the save form immediately. */
  draftToSave?: string;
}

export function QuickReplyPicker({
  open,
  onOpenChange,
  workspaceId,
  onInsert,
  draftToSave,
}: QuickReplyPickerProps) {
  const qc = useQueryClient();
  const listFn = useServerFn(listQuickReplies);
  const createFn = useServerFn(createQuickReply);
  const bumpFn = useServerFn(bumpQuickReplyUsage);

  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(!!draftToSave);
  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState(draftToSave ?? "");

  useEffect(() => {
    if (!open) return;
    setSaving(!!draftToSave);
    setBody(draftToSave ?? "");
    setTitle("");
    setShortcut("");
    setSearch("");
  }, [open, draftToSave]);

  const quickReplies = useQuery({
    queryKey: ["quick-replies", workspaceId, search],
    enabled: open && !!workspaceId,
    staleTime: 15_000,
    queryFn: () => listFn({ data: { workspaceId, search: search.trim() || undefined } }),
  });

  const createMutation = useMutation({
    mutationFn: (vars: { title: string; body: string; shortcut: string | null }) =>
      createFn({
        data: {
          workspaceId,
          title: vars.title,
          body: vars.body,
          shortcut: vars.shortcut,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-replies", workspaceId] });
    },
  });

  const bumpMutation = useMutation({
    mutationFn: (id: string) => bumpFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-replies", workspaceId] });
    },
  });

  const items = quickReplies.data ?? [];
  const filtered = useMemo(() => items, [items]);

  const insert = (qr: QuickReply) => {
    onInsert(qr.body);
    bumpMutation.mutate(qr.id);
    onOpenChange(false);
  };

  const saveNew = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Name and message are required");
      return;
    }
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        shortcut: shortcut.replace(/^\//, "").trim() || null,
      });
      toast.success("Quick reply saved");
      setSaving(false);
      setTitle("");
      setShortcut("");
      setBody("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save quick reply");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {saving ? (
          <>
            <DialogHeader>
              <DialogTitle>Save quick reply</DialogTitle>
              <DialogDescription>
                Save this text so it can be inserted into any conversation later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qr-title" className="text-xs">
                    Name
                  </Label>
                  <Input
                    id="qr-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Thanks for reaching out"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qr-shortcut" className="text-xs">
                    Shortcut <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="qr-shortcut"
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value)}
                    placeholder="thanks"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qr-body" className="text-xs">
                  Message
                </Label>
                <Textarea
                  id="qr-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder="Thanks for reaching out! How can I help?"
                />
              </div>
            </div>
            <DialogFooter>
              {items.length > 0 && (
                <Button
                  variant="ghost"
                  className="mr-auto"
                  onClick={() => setSaving(false)}
                  disabled={createMutation.isPending}
                >
                  Back to list
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={saveNew} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving" : "Save"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Quick replies</DialogTitle>
              <DialogDescription>
                Insert a saved canned response into the composer.
              </DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search quick replies"
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-1.5 pr-1">
              {quickReplies.isLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading
                </div>
              ) : quickReplies.isError ? (
                <div className="py-6 text-center text-sm text-destructive">
                  Could not load quick replies.
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {search.trim() ? "No matches." : "No quick replies yet."}
                  </p>
                </div>
              ) : (
                filtered.map((qr) => (
                  <button
                    key={qr.id}
                    type="button"
                    onClick={() => insert(qr)}
                    className={cn(
                      "w-full flex items-start gap-2 rounded-control border border-border px-2.5 py-2 text-left",
                      "hover:bg-muted transition-colors",
                    )}
                  >
                    <MessageSquareText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">{qr.title}</span>
                        {qr.shortcut && (
                          <Badge variant="outline" className="h-4 px-1 text-[11px] font-mono">
                            /{qr.shortcut}
                          </Badge>
                        )}
                        {qr.usage_count > 0 && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                            <Zap className="h-3 w-3" />
                            {qr.usage_count}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {qr.body.split("\n")[0]}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto h-8 px-2 text-xs"
                onClick={() => {
                  setBody("");
                  setTitle("");
                  setShortcut("");
                  setSaving(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> New quick reply
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
