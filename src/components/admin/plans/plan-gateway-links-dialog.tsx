/**
 * Plan ↔ payment gateway link editor (super admin).
 *
 * Lets staff map a subscription plan onto each enabled payment gateway by
 * storing the gateway's own price/product id (or a hosted checkout URL) for
 * sandbox and live separately.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Link2, Trash2, Plus, AlertTriangle, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  listPlanGatewayLinks,
  upsertPlanGatewayLink,
  deletePlanGatewayLink,
  type PlanGatewayLink,
} from "@/lib/billing/plan-gateways.functions";
import { verifyPlanGatewayLinks } from "@/lib/billing/plan-gateway-verify.functions";
import { listGateways } from "@/lib/billing/gateways.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Draft = {
  provider_id: string;
  mode: "sandbox" | "live";
  external_price_id: string;
  external_product_id: string;
  checkout_url: string;
  enabled: boolean;
};

const emptyDraft: Draft = {
  provider_id: "",
  mode: "sandbox",
  external_price_id: "",
  external_product_id: "",
  checkout_url: "",
  enabled: true,
};

export function PlanGatewayLinksDialog({
  planId,
  planName,
  open,
  onOpenChange,
}: {
  planId: string;
  planName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const listLinks = useServerFn(listPlanGatewayLinks);
  const listGw = useServerFn(listGateways);
  const upsert = useServerFn(upsertPlanGatewayLink);
  const remove = useServerFn(deletePlanGatewayLink);
  const verify = useServerFn(verifyPlanGatewayLinks);
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const linksQ = useQuery({
    queryKey: ["admin", "plan-gateways", planId],
    queryFn: () => listLinks({ data: { plan_id: planId } }),
    enabled: open,
  });

  const gwQ = useQuery({
    queryKey: ["admin", "gateways"],
    queryFn: () => listGw(),
    enabled: open,
  });

  const gateways = (gwQ.data ?? []) as Array<{ id: string; displayName: string; enabled: boolean; mode: string }>;
  const links = (linksQ.data ?? []) as PlanGatewayLink[];

  const saveMut = useMutation({
    mutationFn: (input: Draft) =>
      upsert({
        data: {
          plan_id: planId,
          provider_id: input.provider_id,
          mode: input.mode,
          external_price_id: input.external_price_id.trim() || null,
          external_product_id: input.external_product_id.trim() || null,
          checkout_url: input.checkout_url.trim() || null,
          enabled: input.enabled,
        } as never,
      }),
    onSuccess: () => {
      toast.success("Gateway link saved");
      setDraft(emptyDraft);
      qc.invalidateQueries({ queryKey: ["admin", "plan-gateways", planId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plan-gateways", planId] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const verifyMut = useMutation({
    mutationFn: () => verify({ data: { plan_id: planId, refresh: true } }),
    onSuccess: (res) => {
      const s = res.summary;
      const bad = s.mismatch + s.missing + s.error;
      if (res.results.length === 0) toast.info("No gateway links to verify");
      else if (bad === 0) toast.success(`All ${res.results.length} link(s) verified against the gateway`);
      else toast.warning(`${bad} of ${res.results.length} link(s) need attention`);
      qc.invalidateQueries({ queryKey: ["admin", "plan-gateways", planId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canSave =
    draft.provider_id.length > 0 &&
    (draft.external_price_id.trim().length > 0 || draft.checkout_url.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Payment gateways — {planName}
          </DialogTitle>
          <DialogDescription>
            Map this plan to the price or product it corresponds to in each gateway. Checkout picks the
            link matching the tenant&apos;s default enabled gateway.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Verification calls the gateway API to confirm each price exists and matches this
            plan&apos;s amount, currency and interval.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={verifyMut.isPending || links.length === 0}
            onClick={() => verifyMut.mutate()}
          >
            {verifyMut.isPending ? (
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4 " />
            )}
            Verify mappings
          </Button>
        </div>

        {linksQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading links
          </div>
        ) : (
          <div className="space-y-2">
            {links.length === 0 ? (
              <div className="rounded-control border border-dashed border-border p-4 text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Not linked to any gateway yet — this plan can&apos;t be purchased online.
              </div>
            ) : (
              links.map((l) => {
                const gw = gateways.find((g) => g.id === l.provider_id);
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{gw?.displayName ?? l.provider_id}</span>
                        <Badge variant="outline" className="capitalize">{l.mode}</Badge>
                        {!l.enabled && <Badge variant="outline">Off</Badge>}
                        {gw && !gw.enabled && (
                          <Badge variant="destructive">Gateway disabled</Badge>
                        )}
                        {l.verification_status && (
                          <Badge
                            variant={
                              l.verification_status === "verified"
                                ? "default"
                                : l.verification_status === "mismatch" ||
                                    l.verification_status === "missing" ||
                                    l.verification_status === "error"
                                  ? "destructive"
                                  : "outline"
                            }
                            className="capitalize"
                          >
                            {l.verification_status}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {l.external_price_id ?? l.checkout_url ?? "—"}
                      </div>
                      {l.verification_message && (
                        <div className="text-xs text-muted-foreground truncate">
                          {l.verification_message}
                          {l.last_verified_at
                            ? ` · ${new Date(l.last_verified_at).toLocaleString()}`
                            : ""}
                        </div>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      aria-label="Remove link"
                      onClick={() => delMut.mutate(l.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="rounded-control border border-border p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Gateway</Label>
              <Select
                value={draft.provider_id}
                onValueChange={(v) => setDraft((d) => ({ ...d, provider_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select a gateway" /></SelectTrigger>
                <SelectContent>
                  {gateways.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.displayName}{g.enabled ? "" : " (disabled)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Environment</Label>
              <Select
                value={draft.mode}
                onValueChange={(v) => setDraft((d) => ({ ...d, mode: v as Draft["mode"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Test</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gateway price / plan ID</Label>
              <Input
                placeholder="price_123 / P-XXXX"
                value={draft.external_price_id}
                onChange={(e) => setDraft((d) => ({ ...d, external_price_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gateway product ID (optional)</Label>
              <Input
                placeholder="prod_123"
                value={draft.external_product_id}
                onChange={(e) => setDraft((d) => ({ ...d, external_product_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Hosted checkout URL (optional)</Label>
              <Input
                placeholder="https://"
                value={draft.checkout_url}
                onChange={(e) => setDraft((d) => ({ ...d, checkout_url: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
                id="pgl-enabled"
              />
              <Label htmlFor="pgl-enabled" className="text-sm font-normal">Active</Label>
            </div>
            <Button disabled={!canSave || saveMut.isPending} onClick={() => saveMut.mutate(draft)}>
              {saveMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 " />
              )}
              Save link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
