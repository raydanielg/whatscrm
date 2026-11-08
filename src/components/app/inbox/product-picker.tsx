/**
 * Product attachment picker for the Inbox composer.
 *
 * WhatsApp: sends a native catalog message (single product or product list)
 * as one `interactive` outbound row; only products synced to the WhatsApp
 * catalog can be picked. Other channels: sends product cards (image + caption,
 * or text) shaped by the channel's attachment rules.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Package, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSendMessage, type MessageMetadata } from "@/hooks/use-messages";
import {
  listInboxProducts,
  prepareProductMessage,
  type InboxProduct,
} from "@/lib/inbox/product-attachment.functions";
import { attachmentRules } from "@/lib/inbox/channel-attachments";
import { formatMoney } from "@/lib/currency/format";
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

const MAX_ITEMS = 30;
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "you",
  "your",
  "have",
  "with",
  "this",
  "that",
  "what",
  "how",
  "can",
  "are",
  "please",
  "want",
  "need",
  "price",
  "much",
  "any",
  "there",
  "hello",
  "thanks",
  "thank",
  "about",
  "from",
  "will",
  "would",
  "like",
  "does",
  "show",
  "send",
]);

function keywords(texts: string[]): string[] {
  const words = texts
    .join(" ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return Array.from(new Set(words));
}

function productPrice(p: InboxProduct): string | null {
  const amount = p.sale_price ?? p.price;
  return amount == null ? null : formatMoney(amount, p.currency);
}

export interface ProductPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  conversationId: string;
  channel?: string | null;
  replyToId?: string | null;
  onSent?: () => void;
}

export function ProductPicker({
  open,
  onOpenChange,
  workspaceId,
  conversationId,
  channel,
  replyToId,
  onSent,
}: ProductPickerProps) {
  const rules = attachmentRules(channel);
  const native = rules.nativeProducts;
  const send = useSendMessage();
  const listFn = useServerFn(listInboxProducts);
  const prepareFn = useServerFn(prepareProductMessage);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);

  const products = useQuery({
    queryKey: ["inbox-products", workspaceId],
    enabled: open && !!workspaceId,
    staleTime: 60_000,
    queryFn: () => listFn({ data: { workspaceId } }),
  });

  // Last few customer messages drive the "suggested" section.
  const recentInbound = useQuery({
    queryKey: ["inbox-products-recent-inbound", conversationId],
    enabled: open && !!conversationId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("body")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []).map((r) => r.body ?? "").filter(Boolean);
    },
  });

  const all = products.data ?? [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? all.filter((p) =>
        [p.name, p.sku, p.category, ...(p.tags ?? [])]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : all;

  const suggested = useMemo(() => {
    const words = keywords(recentInbound.data ?? []);
    const haystack = (p: InboxProduct) =>
      [p.name, p.category, ...(p.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
    const matched = words.length
      ? all.filter((p) => words.some((w) => haystack(p).includes(w)))
      : [];
    const list = matched.length ? matched : all.filter((p) => p.is_featured);
    return { list: list.slice(0, 6), fromChat: matched.length > 0 };
  }, [all, recentInbound.data]);

  const isSelectable = (p: InboxProduct) => !native || p.wa_catalog_status === "synced";

  const toggle = (p: InboxProduct) => {
    if (!isSelectable(p)) return;
    setSelected((cur) => {
      if (cur.includes(p.id)) return cur.filter((id) => id !== p.id);
      if (cur.length >= MAX_ITEMS) {
        toast.error(`Pick up to ${MAX_ITEMS} products`);
        return cur;
      }
      return [...cur, p.id];
    });
  };

  const reset = () => {
    setSelected([]);
    setSearch("");
    setBodyText("");
  };

  const submit = async () => {
    if (!selected.length) return;
    setSending(true);
    try {
      const prepared = await prepareFn({
        data: {
          workspaceId,
          conversationId,
          productIds: selected,
          bodyText: bodyText.trim() || undefined,
        },
      });
      if (prepared.kind === "whatsapp_catalog") {
        await send.mutateAsync({
          conversationId,
          messageType: "interactive",
          body: prepared.body,
          replyToId: replyToId ?? null,
          metadata: prepared.metadata as unknown as MessageMetadata,
        });
      } else {
        for (const row of prepared.rows) {
          await send.mutateAsync({
            conversationId,
            messageType: row.messageType,
            body: row.body || undefined,
            mediaUrl: row.mediaUrl ?? null,
            mediaType: row.mediaType ?? null,
            replyToId: replyToId ?? null,
            metadata: row.metadata as MessageMetadata,
          });
        }
      }
      toast.success(selected.length === 1 ? "Product sent" : `${selected.length} products sent`);
      reset();
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast.error("Could not send products", { description: String((e as Error).message) });
    } finally {
      setSending(false);
    }
  };

  const renderRow = (p: InboxProduct) => {
    const selectable = isSelectable(p);
    const isOn = selected.includes(p.id);
    const price = productPrice(p);
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => toggle(p)}
        disabled={!selectable}
        title={selectable ? undefined : "Sync to WhatsApp catalog first"}
        className={cn(
          "w-full flex items-center gap-3 rounded-control border px-2 py-1.5 text-left transition-colors",
          isOn ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
          !selectable && "opacity-50 cursor-not-allowed hover:bg-transparent",
        )}
      >
        <div className="h-10 w-10 shrink-0 rounded-control bg-muted overflow-hidden flex items-center justify-center">
          {p.image_url ? (
            <img src={p.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Package className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{p.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {[price, p.category, p.sku].filter(Boolean).join(" · ")}
          </div>
          {native && !selectable && (
            <div className="text-[11px] text-amber-600">Sync to WhatsApp catalog first</div>
          )}
        </div>
        {native && selectable && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px] shrink-0">
            Synced
          </Badge>
        )}
        <div
          className={cn(
            "h-4 w-4 shrink-0 rounded-control border flex items-center justify-center",
            isOn
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/40",
          )}
        >
          {isOn && <Check className="h-3 w-3" />}
        </div>
      </button>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (sending) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send products</DialogTitle>
          <DialogDescription>
            {native
              ? "Sent as a WhatsApp catalog message. Customers can view and add items to their cart."
              : rules.kinds.includes("image")
                ? `Sent as product cards (photo, name, price and link) on ${rules.label}.`
                : `Sent as text (name, price and link) on ${rules.label}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU, category"
            className="pl-8"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
          {products.isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading products
            </div>
          ) : products.isError ? (
            <div className="py-6 text-center text-sm text-destructive">
              Could not load products.
            </div>
          ) : all.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No active products yet. Add products in Commerce first.
            </div>
          ) : (
            <>
              {!q && suggested.list.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Sparkles className="h-3 w-3" />
                    {suggested.fromChat ? "Suggested from this chat" : "Featured"}
                  </div>
                  {suggested.list.map(renderRow)}
                </div>
              )}
              <div className="space-y-1.5">
                {!q && (
                  <div className="text-[11px] font-medium text-muted-foreground">All products</div>
                )}
                {filtered.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">No matches.</div>
                ) : (
                  filtered.map(renderRow)
                )}
              </div>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-message">
            Message <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="product-message"
            rows={2}
            maxLength={1024}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder={
              native ? "Here are some products for you" : "Add a note before the products"
            }
          />
        </div>

        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            {selected.length} selected{native ? ` (max ${MAX_ITEMS})` : ""}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={sending || selected.length === 0}>
            {sending ? "Sending" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
