import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone, Loader2, Plus, Trash2, Power, RefreshCw, QrCode } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sbAny } from "@/lib/supabase/untyped";

type Device = {
  id: string;
  name: string;
  phone_number: string | null;
  device_type: "qr" | "cloud_api" | "byoa";
  status: "connected" | "connecting" | "disconnected" | "banned" | "expired";
  platform: string | null;
  battery_level: number | null;
  last_seen_at: string | null;
  connected_at: string | null;
  created_at: string;
};

const DEVICE_TYPES = [
  { value: "qr", label: "QR Scan (multi-device)" },
  { value: "cloud_api", label: "WhatsApp Cloud API" },
  { value: "byoa", label: "Bring Your Own Account" },
] as const;

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone_number: z.string().trim().max(32).optional().or(z.literal("")),
  device_type: z.enum(["qr", "cloud_api", "byoa"]),
});

const STATUS_STYLES: Record<Device["status"], string> = {
  connected: "bg-success/10 text-success border-success/20",
  connecting: "bg-warning/10 text-warning border-warning/20",
  disconnected: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
  banned: "bg-destructive/10 text-destructive border-destructive/20",
};

export function WhatsAppDevicesPanel() {
  const { data: ws } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone_number: "", device_type: "qr" as const });

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ["whatsapp_devices", ws?.id],
    enabled: !!ws?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_devices")
        .select("*")
        .eq("workspace_id", ws!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Device[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: z.infer<typeof schema>) => {
      const { error } = await sbAny(supabase).from("whatsapp_devices").insert({
        workspace_id: ws!.id,
        name: input.name,
        phone_number: input.phone_number || null,
        device_type: input.device_type,
        status: "connecting",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Device added — scan the QR to connect");
      setOpen(false);
      setForm({ name: "", phone_number: "", device_type: "qr" });
      qc.invalidateQueries({ queryKey: ["whatsapp_devices", ws?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (d: Device) => {
      const next = d.status === "connected" ? "disconnected" : "connecting";
      const { error } = await supabase
        .from("whatsapp_devices")
        .update({
          status: next,
          connected_at: next === "connecting" ? null : d.connected_at,
        })
        .eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_devices", ws?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("whatsapp_devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Device removed");
      qc.invalidateQueries({ queryKey: ["whatsapp_devices", ws?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    create.mutate(parsed.data);
  }

  const connected = devices.filter((d) => d.status === "connected").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <Smartphone className="w-5 h-5" /> WhatsApp Devices
          </h2>
          <p className="text-sm text-muted-foreground">Manage your connected instances</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Instance
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={devices.length} />
        <StatCard label="Connected" value={connected} />
        <StatCard label="Offline" value={devices.length - connected} />
        <StatCard label="Type" value={new Set(devices.map((d) => d.device_type)).size} />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading devices
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-10 text-center space-y-3">
          <Smartphone className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Add your first WhatsApp instance to get started
          </p>
          <Button onClick={() => setOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Instance
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {devices.map((d) => (
            <div
              key={d.id}
              className="rounded-control border border-border bg-surface p-4 flex items-center justify-between gap-3 flex-wrap"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-control bg-muted flex items-center justify-center shrink-0">
                  {d.device_type === "qr" ? (
                    <QrCode className="w-5 h-5" />
                  ) : (
                    <Smartphone className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{d.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.phone_number ?? "No number linked"} ·{" "}
                    {DEVICE_TYPES.find((t) => t.value === d.device_type)?.label}
                    {d.last_seen_at && (
                      <> · seen {formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true })}</>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs capitalize ${STATUS_STYLES[d.status]}`}>
                  {d.status}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggle.mutate(d)}
                  disabled={toggle.isPending}
                  className="gap-1.5"
                >
                  {d.status === "connected" ? (
                    <>
                      <Power className="w-3.5 h-3.5" /> Disconnect
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" /> Reconnect
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Remove "${d.name}"?`)) remove.mutate(d.id);
                  }}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add WhatsApp instance</DialogTitle>
            <DialogDescription>
              Register a new device. QR-based instances will be paired from the QR panel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sales phone"
              />
            </div>
            <div>
              <Label>Phone number (optional)</Label>
              <Input
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                placeholder="+1 555 123 4567"
              />
            </div>
            <div>
              <Label>Connection type</Label>
              <Select
                value={form.device_type}
                onValueChange={(v) => setForm({ ...form, device_type: v as typeof form.device_type })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add instance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="text-2xl font-display font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground ">{label}</div>
    </div>
  );
}
