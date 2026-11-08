import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import {
  Plus,
  Trash2,
  Pencil,
  Copy,
  Download,
  ExternalLink,
  IdCard,
  Eye,
  Loader2,
  History,
  Ban,
  RotateCcw,
} from "lucide-react";
import { ACCENT_PRESETS, DEFAULT_ACCENT, useTenantAccent } from "@/lib/themes/tenant-accent";
import { VCardHistorySheet } from "@/components/app/vcards/vcard-history-sheet";
import {
  WorkspaceContextIndicator,
  useWorkspaceContext,
} from "@/components/app/vcards/workspace-context-indicator";
import {
  useVCards,
  useSaveVCard,
  useDeleteVCard,
  useSetVCardRevocation,
  useCanManageVCardLifecycle,
  validateVCard,
  slugify,
  downloadVCardFile,
  type VCard,
  type VCardInput,
} from "@/hooks/use-vcards";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/vcards")({
  component: VCardsPage,
  staticData: { breadcrumb: "Digital Cards" },
  head: () => ({
    meta: [
      { title: "Digital Business Cards" },
      {
        name: "description",
        content:
          "Create, brand and share digital vCards for your team and customers with one-tap save-to-contacts.",
      },
      { property: "og:title", content: "Digital Business Cards" },
      {
        property: "og:description",
        content: "Create, brand and share digital vCards with one-tap save-to-contacts.",
      },
    ],
  }),
});

const emptyCard: VCardInput = {
  full_name: "",
  slug: "",
  job_title: "",
  company: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  address: "",
  bio: "",
  avatar_url: "",
  socials: {},
  theme: { accent: DEFAULT_ACCENT, layout: "modern" },
  is_public: true,
};

function VCardsPage() {
  const { accent: tenantAccent } = useTenantAccent();
  const formatZonedDate = useZonedDateFormatter();
  const { data: cards = [], isLoading } = useVCards();
  const save = useSaveVCard();
  const remove = useDeleteVCard();
  const revocation = useSetVCardRevocation();
  const { canManage: canManageLifecycle, role: workspaceRole } = useCanManageVCardLifecycle();
  const { workspace: contextWorkspace } = useWorkspaceContext();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VCard | null>(null);
  const [form, setForm] = useState<VCardInput>(emptyCard);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<VCard | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [historyCard, setHistoryCard] = useState<VCard | null>(null);
  const [revokeCard, setRevokeCard] = useState<VCard | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const setRevocation = async (card: VCard, revoked: boolean, reason?: string) => {
    try {
      await revocation.mutateAsync({ id: card.id, revoked, reason });
      toast.success(revoked ? "Card revoked — the public link is now dead" : "Card reactivated");
      setRevokeCard(null);
      setRevokeReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update the card");
    }
  };

  const shareUrl = (slug: string) =>
    typeof window === "undefined" ? `/v/${slug}` : `${window.location.origin}/v/${slug}`;

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyCard, theme: { ...emptyCard.theme, accent: tenantAccent } });
    setErrors({});
    setSlugTouched(false);
    setOpen(true);
  };
  const openEdit = (c: VCard) => {
    setEditing(c);
    setForm({ ...c });
    setErrors({});
    setSlugTouched(true);
    setOpen(true);
  };

  const submit = async () => {
    const errs = validateVCard(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await save.mutateAsync(form);
      toast.success(editing ? "Card updated" : "Card created", {
        description: contextWorkspace ? `Saved in ${contextWorkspace.name}` : undefined,
      });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save card");
    }
  };

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(slug));
      toast.success("Share link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <>
      <AppTopbar
        title="Digital Business Cards"
        subtitle="Branded vCards with a public share link, QR-ready URL and one-tap save to contacts."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New card
          </Button>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <WorkspaceContextIndicator />

        {isLoading ? (
          <Card className="p-10 text-center text-muted-foreground">Loading cards</Card>
        ) : cards.length === 0 ? (
          <Card className="p-10 text-center space-y-3">
            <IdCard className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">No digital cards yet</p>
            <p className="text-sm text-muted-foreground">
              Create a card for yourself or a customer and share it via WhatsApp or email.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New card
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => (
              <Card key={c.id} className="overflow-hidden">
                <div className="h-14" style={{ background: c.theme?.accent ?? tenantAccent }} />
                <div className="p-4 -mt-8 space-y-3">
                  <div
                    className="h-14 w-14 rounded-full border-4 border-card bg-muted overflow-hidden flex items-center justify-center text-lg font-semibold"
                    aria-hidden={!c.avatar_url}
                  >
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt={`${c.full_name} profile photo`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      c.full_name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{c.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[c.job_title, c.company].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {c.revoked_at ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Badge variant={c.is_public ? "secondary" : "outline"}>
                        {c.is_public ? "Public" : "Private"}
                      </Badge>
                    )}
                    <Badge variant="outline">v{c.version}</Badge>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {c.view_count}
                    </span>
                    <span className="truncate">/v/{c.slug}</span>
                  </div>
                  {c.revoked_at && (
                    <p className="text-xs text-muted-foreground">
                      Revoked {formatZonedDate(c.revoked_at, {})}
                      {c.revoked_reason ? ` · ${c.revoked_reason}` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy(c.slug)}>
                      <Copy className="h-3.5 w-3.5 " />
                      Copy link
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadVCardFile(c)}>
                      <Download className="h-3.5 w-3.5 " />
                      .vcf
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Audit trail"
                      onClick={() => setHistoryCard(c)}
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={shareUrl(c.slug)} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {canManageLifecycle &&
                      (c.revoked_at ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Reactivate card"
                          disabled={revocation.isPending}
                          onClick={() => setRevocation(c, false)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Revoke card"
                          disabled={revocation.isPending}
                          onClick={() => {
                            setRevokeReason("");
                            setRevokeCard(c);
                          }}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      ))}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setConfirmDelete(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {!canManageLifecycle && (
                    <p className="text-xs text-muted-foreground">
                      Revoking or restoring a card needs manager, admin or owner access
                      {workspaceRole ? ` — you are a ${workspaceRole}` : ""}.
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!save.isPending) setOpen(v);
        }}
      >
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => {
            if (save.isPending) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (save.isPending) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Edit card" : "New digital card"}</DialogTitle>
            <DialogDescription>
              Everything on a public card is visible to anyone with the link.
            </DialogDescription>
            <div className="pt-1">
              <WorkspaceContextIndicator />
            </div>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input
                  value={form.full_name}
                  disabled={save.isPending}
                  onChange={(e) => {
                    const full_name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      full_name,
                      slug: slugTouched ? f.slug : slugify(full_name),
                    }));
                  }}
                />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Share link</Label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">/v/</span>
                  <Input
                    value={form.slug}
                    disabled={save.isPending}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
                    }}
                  />
                </div>
                {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Job title</Label>
                <Input
                  value={form.job_title ?? ""}
                  disabled={save.isPending}
                  onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Input
                  value={form.company ?? ""}
                  disabled={save.isPending}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone ?? ""}
                  disabled={save.isPending}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input
                  value={form.whatsapp ?? ""}
                  disabled={save.isPending}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                  placeholder="+4712345678"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  value={form.email ?? ""}
                  disabled={save.isPending}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input
                  value={form.website ?? ""}
                  disabled={save.isPending}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="https://"
                />
                {errors.website && <p className="text-xs text-destructive">{errors.website}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Profile photo URL</Label>
              <Input
                value={form.avatar_url ?? ""}
                disabled={save.isPending}
                onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
                placeholder="https://"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={form.address ?? ""}
                disabled={save.isPending}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Short bio</Label>
              <Textarea
                rows={3}
                value={form.bio ?? ""}
                disabled={save.isPending}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>LinkedIn</Label>
                <Input
                  value={form.socials?.linkedin ?? ""}
                  disabled={save.isPending}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, socials: { ...f.socials, linkedin: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Instagram</Label>
                <Input
                  value={form.socials?.instagram ?? ""}
                  disabled={save.isPending}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, socials: { ...f.socials, instagram: e.target.value } }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Accent colour</Label>
              <div className="flex gap-2">
                {[...new Set([tenantAccent, ...ACCENT_PRESETS.map((p) => p.value)])].map(
                  (color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Accent ${color}`}
                      disabled={save.isPending}
                      onClick={() =>
                        setForm((f) => ({ ...f, theme: { ...f.theme, accent: color } }))
                      }
                      className={`h-7 w-7 rounded-full border-2 ${form.theme?.accent === color ? "border-foreground" : "border-transparent"}`}
                      style={{ background: color }}
                    />
                  ),
                )}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                <Label>Public card</Label>
                <p className="text-xs text-muted-foreground">Anyone with the link can view it.</p>
              </div>
              <Switch
                checked={form.is_public ?? true}
                disabled={save.isPending}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_public: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Save changes" : "Create card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!revokeCard}
        onOpenChange={(v) => {
          if (!revocation.isPending && !v) setRevokeCard(null);
        }}
      >
        <DialogContent
          onInteractOutside={(e) => {
            if (revocation.isPending) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (revocation.isPending) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Revoke this card?</DialogTitle>
            <DialogDescription>
              /v/{revokeCard?.slug} stops resolving for everyone immediately. The card and its
              history are kept, and you can reactivate it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (recorded in the audit trail)</Label>
            <Input
              value={revokeReason}
              disabled={revocation.isPending}
              placeholder="Employee left the company"
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeCard(null)}
              disabled={revocation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revocation.isPending}
              onClick={() => revokeCard && setRevocation(revokeCard, true, revokeReason)}
            >
              {revocation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Revoke card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VCardHistorySheet
        card={historyCard}
        open={!!historyCard}
        onOpenChange={(v) => !v && setHistoryCard(null)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title="Delete this card?"
        description={`The share link /v/${confirmDelete?.slug ?? ""} will stop working immediately.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete.id);
            toast.success("Card deleted");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete card");
          } finally {
            setConfirmDelete(null);
          }
        }}
      />
    </>
  );
}
