import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useContacts, primaryPhone, primaryEmail } from "@/hooks/use-contacts";
import { Play, Search, User, Loader2, FlaskConical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export type SimulateInput = {
  contact: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    tags: string[];
  } | null;
  message: string;
  extraJson: string;
};

export function SimulateRunDialog({
  open,
  onClose,
  onRun,
  running,
}: {
  open: boolean;
  onClose: () => void;
  onRun: (payload: Record<string, unknown>) => void;
  running: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("Hello, I'd like more info");
  const [extra, setExtra] = React.useState("{}");
  const [extraErr, setExtraErr] = React.useState<string | null>(null);

  const { data: contacts = [], isLoading } = useContacts({ search: q });
  const list = contacts.slice(0, 25);
  const selected = list.find((c) => c.id === selectedId) ?? null;

  React.useEffect(() => {
    if (!open) return;
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [open, list, selectedId]);

  const run = () => {
    let parsedExtra: Record<string, unknown> = {};
    if (extra.trim()) {
      try {
        parsedExtra = JSON.parse(extra);
        setExtraErr(null);
      } catch (e) {
        setExtraErr((e as Error).message);
        return;
      }
    }
    const contactPayload = selected
      ? {
          id: selected.id,
          name: selected.display_name ?? selected.first_name ?? "Contact",
          phone: primaryPhone(selected),
          email: primaryEmail(selected),
          tags: selected.tags ?? [],
        }
      : null;
    onRun({
      trigger: "test",
      contact: contactPayload,
      message: { text: message },
      ...parsedExtra,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !running && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="w-4 h-4 text-primary" /> Simulate flow
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pick a sample contact and payload, then run the current graph in dry-run mode. Actions won't
            send real messages — you'll see step-by-step results in the drawer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Contacts */}
          <section className="min-w-0">
            <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Sample contact</div>
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, phone, email"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-control border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <ScrollArea
              type="hover"
              className="rounded-control border border-border bg-background"
              viewportClassName="max-h-64 [&>div]:!block"
            >
              {isLoading && (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading contacts
                </div>
              )}
              {!isLoading && list.length === 0 && (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  No contacts. You can still run with no contact — trigger data will still be evaluated.
                </div>
              )}
              {list.map((c) => {
                const name = c.display_name ?? c.first_name ?? "Unnamed";
                const sub = primaryPhone(c) ?? primaryEmail(c) ?? "—";
                const isSel = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-3 py-2 border-b border-border/60 last:border-b-0 flex items-center gap-2 transition ${
                      isSel ? "bg-primary/10" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full grid place-items-center shrink-0 ${isSel ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                    </div>
                    {isSel && <div className="text-[11px] text-primary font-semibold">SELECTED</div>}
                  </button>
                );
              })}
            </ScrollArea>
            <button
              onClick={() => setSelectedId(null)}
              className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Run without contact
            </button>
          </section>

          {/* Trigger payload */}
          <section className="min-w-0">
            <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Trigger payload</div>
            <label className="block text-[11px] text-muted-foreground mb-1">Simulated inbound message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full px-2.5 py-1.5 text-xs rounded-control border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Text used as {{message.text}}"
            />
            <label className="block text-[11px] text-muted-foreground mt-3 mb-1">Extra variables (JSON)</label>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={6}
              spellCheck={false}
              className={`w-full px-2.5 py-1.5 text-[11px] font-mono rounded-control border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                extraErr ? "border-rose-500/60" : "border-border"
              }`}
              placeholder='{ "utm_source": "test" }'
            />
            {extraErr && <div className="text-[11px] text-rose-600 mt-1">Invalid JSON: {extraErr}</div>}

            {selected && (
              <div className="mt-3 rounded-control border border-border bg-muted/30 p-2.5">
                <div className="text-[11px] font-semibold text-muted-foreground mb-1">Bound to {`{{contact}}`}</div>
                <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto">
{JSON.stringify(
  {
    id: selected.id,
    name: selected.display_name ?? selected.first_name,
    phone: primaryPhone(selected),
    email: primaryEmail(selected),
    tags: selected.tags ?? [],
  },
  null,
  2,
)}
                </pre>
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="pt-2">
          <button
            onClick={onClose}
            disabled={running}
            className="px-3 py-1.5 rounded-control text-xs font-medium border border-border bg-surface hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={run}
            disabled={running || !!extraErr}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run simulation
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
