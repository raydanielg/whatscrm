import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, Loader2, Plus, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimePicker } from "@/shared/components";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { sbAny } from "@/lib/supabase/untyped";

type WarmerSettings = {
  workspace_id: string;
  enabled: boolean;
  daily_target: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  active_from: string;
  active_to: string;
};

type WarmerMessage = {
  id: string;
  content: string;
  sort_order: number;
  created_at: string;
};

export function WhatsAppWarmerPanel() {
  const { data: ws } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [newMsg, setNewMsg] = useState("");
  const [local, setLocal] = useState<Partial<WarmerSettings>>({});

  const { data: settings } = useQuery({
    queryKey: ["warmer_settings", ws?.id],
    enabled: !!ws?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_warmer_settings")
        .select("*")
        .eq("workspace_id", ws!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        workspace_id: ws!.id,
        enabled: false,
        daily_target: 30,
        min_delay_seconds: 45,
        max_delay_seconds: 240,
        active_from: "09:00",
        active_to: "21:00",
      }) as WarmerSettings;
    },
  });

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["warmer_messages", ws?.id],
    enabled: !!ws?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_warmer_messages")
        .select("*")
        .eq("workspace_id", ws!.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as WarmerMessage[];
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (patch: Partial<WarmerSettings>) => {
      const merged = { ...settings, ...patch, workspace_id: ws!.id } as WarmerSettings;
      const { error } = await supabase
        .from("whatsapp_warmer_settings")
        .upsert(merged, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Warmer settings saved");
      qc.invalidateQueries({ queryKey: ["warmer_settings", ws?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMessage = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await sbAny(supabase).from("whatsapp_warmer_messages").insert({
        workspace_id: ws!.id,
        content,
        sort_order: messages.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMsg("");
      qc.invalidateQueries({ queryKey: ["warmer_messages", ws?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("whatsapp_warmer_messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warmer_messages", ws?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function submitMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const v = newMsg.trim();
    if (!v) return;
    if (v.length > 500) {
      toast.error("Message too long (max 500)");
      return;
    }
    addMessage.mutate(v);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <Flame className="w-5 h-5 text-warning" /> WhatsApp Warmer
          </h2>
          <p className="text-sm text-muted-foreground">Automated human behavior for safer messaging.</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={local.enabled ?? false}
            onCheckedChange={(v) => {
              setLocal((s) => ({ ...s, enabled: v }));
              saveSettings.mutate({ enabled: v });
            }}
          />
          <span className="text-sm">{local.enabled ? "Enabled" : "Disabled"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-control border border-border bg-surface p-4">
        <NumberField
          label="Daily target (messages / device)"
          value={local.daily_target ?? 30}
          onChange={(v) => setLocal((s) => ({ ...s, daily_target: v }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Min delay (s)"
            value={local.min_delay_seconds ?? 45}
            onChange={(v) => setLocal((s) => ({ ...s, min_delay_seconds: v }))}
          />
          <NumberField
            label="Max delay (s)"
            value={local.max_delay_seconds ?? 240}
            onChange={(v) => setLocal((s) => ({ ...s, max_delay_seconds: v }))}
          />
        </div>
        <div>
          <Label>Active from</Label>
          <TimePicker
            value={local.active_from ?? "09:00"}
            onChange={(v) => setLocal((s) => ({ ...s, active_from: v ?? "" }))}
          />
        </div>
        <div>
          <Label>Active to</Label>
          <TimePicker
            value={local.active_to ?? "21:00"}
            onChange={(v) => setLocal((s) => ({ ...s, active_to: v ?? "" }))}
          />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button
            size="sm"
            onClick={() => saveSettings.mutate(local)}
            disabled={saveSettings.isPending}
          >
            {saveSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save settings
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Messages
            <span className="text-xs text-muted-foreground">
              {messages.length} Message{messages.length === 1 ? "" : "s"}
            </span>
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Add messages to the warmer script. These messages will be sent automatically between your
          devices to simulate real conversations.
        </p>

        <form onSubmit={submitMessage} className="flex items-center gap-2">
          <Input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="Type a warmer message"
            maxLength={500}
          />
          <Button type="submit" size="sm" className="gap-1.5" disabled={addMessage.isPending}>
            {addMessage.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add
          </Button>
        </form>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-control border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No warmer messages yet. Add your first one above.
          </div>
        ) : (
          <ul className="grid gap-2">
            {messages.map((m, i) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted-foreground w-6 ">{i + 1}.</span>
                  <span className="text-sm truncate">{m.content}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeMessage.mutate(m.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}
