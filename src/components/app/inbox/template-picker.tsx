import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Command as CommandIcon,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Star,
  Zap,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  useCreateTemplate,
  useMessageTemplates,
  useRegisterTemplateUsage,
  renderTemplate,
  type MessageTemplate,
} from "@/hooks/use-productivity";
import { useSyncTemplates, useTemplates } from "@/hooks/use-wa-templates";
import { useChannelAccounts } from "@/hooks/use-channel-accounts";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  TemplatePreviewDialog,
  type TemplatePreviewTarget,
} from "./template-preview-dialog";
import {
  buildTemplateSendPayload,
  type TemplateComponent,
  type TemplateSendPayload,
} from "@/lib/messaging/template-send-payload";
import type { ContactLike } from "@/lib/messaging/variable-autosuggest";

/** Approved WhatsApp Cloud template surfaced in the picker. */
type WaPickerTemplate = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  components: TemplateComponent[];
};

function waBodyText(components: unknown): string {
  if (!Array.isArray(components)) return "";
  const parts: string[] = [];
  for (const raw of components) {
    const c = raw as { type?: string; text?: string };
    const type = String(c?.type ?? "").toUpperCase();
    if ((type === "HEADER" || type === "BODY" || type === "FOOTER") && typeof c.text === "string") {
      parts.push(c.text);
    }
  }
  return parts.join("\n\n").trim();
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (rendered: string, template: MessageTemplate) => void;
  /** One-click: insert the rendered template AND send it immediately. */
  onPickAndSend?: (
    rendered: string,
    template: MessageTemplate,
    payload?: TemplateSendPayload,
  ) => void | Promise<void>;
  contextVars?: Record<string, string | undefined | null>;
  /** Selected contact / CRM record used to auto-suggest template variables. */
  contact?: ContactLike;
  initialSearch?: string;
};

export function TemplatePicker({
  open,
  onOpenChange,
  onPick,
  onPickAndSend,
  contextVars,
  contact,
  initialSearch,
}: Props) {

  const [search, setSearch] = useState(initialSearch ?? "");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState("");
  const { data: templates = [], isLoading } = useMessageTemplates();
  const registerUsage = useRegisterTemplateUsage();
  const createTemplate = useCreateTemplate();
  const { active } = useCurrentWorkspace();
  const { data: waData, isLoading: waLoading } = useTemplates(active?.id);
  const { data: accountsRes } = useChannelAccounts(active?.id);
  const syncTemplates = useSyncTemplates();
  const waAccountId = useMemo(() => {
    const accounts = Array.isArray(accountsRes?.accounts) ? accountsRes.accounts : [];
    const wa = accounts.filter((a) => String(a.provider ?? "").startsWith("whatsapp"));
    return (wa.find((a) => a.is_default) ?? wa[0])?.id;
  }, [accountsRes]);

  function runSync() {
    if (!active?.id || !waAccountId) return;
    syncTemplates.mutate({ workspaceId: active.id, channelAccountId: waAccountId });
  }

  const syncStatus = syncTemplates.isPending
    ? "Syncing templates from WhatsApp"
    : syncTemplates.isError
      ? "Sync failed — check your WhatsApp connection."
      : syncTemplates.isSuccess
        ? `Synced ${syncTemplates.data?.synced ?? 0} template(s).`
        : !waAccountId
          ? "Connect a WhatsApp account to sync templates."
          : null;

  const syncBar = (
    <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
      <span className="text-[11px] text-muted-foreground truncate">
        {syncStatus ?? "Approved WhatsApp Cloud templates appear below."}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 text-xs"
        disabled={!waAccountId || syncTemplates.isPending}
        onClick={runSync}
      >
        {syncTemplates.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Sync templates
      </Button>
    </div>
  );

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setName("");
      setShortcut("");
      setBody("");
    }
  }, [open]);

  const { favorites, recent, others } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? templates.filter(
          (t) =>
            t.name.toLowerCase().includes(term) ||
            t.body.toLowerCase().includes(term) ||
            (t.shortcut && t.shortcut.toLowerCase().includes(term)),
        )
      : templates;
    return {
      favorites: filtered.filter((t) => t.is_favorite),
      recent: filtered
        .filter((t) => !t.is_favorite && t.last_used_at)
        .slice(0, 6),
      others: filtered.filter(
        (t) => !t.is_favorite && !t.last_used_at,
      ),
    };
  }, [templates, search]);

  const waTemplates: WaPickerTemplate[] = useMemo(() => {
    const rows = (waData?.templates ?? []) as unknown as Array<Record<string, unknown>>;
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => String(r.status ?? "").toUpperCase() === "APPROVED")
      .map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ""),
        language: String(r.language ?? ""),
        category: String(r.category ?? ""),
        body: waBodyText(r.components),
        components: (Array.isArray(r.components) ? r.components : []) as TemplateComponent[],
      }))
      .filter((t) => t.body.length > 0)
      .filter(
        (t) =>
          !term ||
          t.name.toLowerCase().includes(term) ||
          t.body.toLowerCase().includes(term),
      );
  }, [waData, search]);

  const waAsTemplate = (t: WaPickerTemplate) =>
    ({
      id: t.id,
      name: t.name,
      body: t.body,
      shortcut: null,
      category: t.category,
      language: t.language,
    }) as unknown as MessageTemplate;

  const close = () => {
    onOpenChange(false);
    setSearch("");
  };

  // Any {{token}} left after context substitution needs the parameter editor
  const hasUnresolved = (rendered: string) => /\{\{\s*[^}]+\s*\}\}/.test(rendered);

  const pickWa = (t: WaPickerTemplate) => {
    const rendered = renderTemplate(t.body, contextVars ?? {});
    if (hasUnresolved(rendered)) {
      previewWa(t);
      return;
    }
    onPick(rendered, waAsTemplate(t));
    close();
  };

  const sendWa = (t: WaPickerTemplate) => {
    const rendered = renderTemplate(t.body, contextVars ?? {});
    if (hasUnresolved(rendered)) {
      previewWa(t);
      return;
    }
    const payload = buildTemplateSendPayload(
      { name: t.name, language: t.language, components: t.components },
      contextVars as Record<string, string>,
    );
    void onPickAndSend?.(rendered, waAsTemplate(t), payload);
    close();
  };

  const pick = (t: MessageTemplate) => {
    const rendered = renderTemplate(t.body, contextVars ?? {});
    if (hasUnresolved(rendered)) {
      previewLocal(t);
      return;
    }
    onPick(rendered, t);
    registerUsage.mutate(t);
    close();
  };

  const sendNow = (t: MessageTemplate) => {
    const rendered = renderTemplate(t.body, contextVars ?? {});
    if (hasUnresolved(rendered)) {
      previewLocal(t);
      return;
    }
    void onPickAndSend?.(rendered, t);
    registerUsage.mutate(t);
    close();
  };


  const [preview, setPreview] = useState<{
    target: TemplatePreviewTarget;
    template: MessageTemplate;
    isLocal: boolean;
  } | null>(null);

  const previewWa = (t: WaPickerTemplate) =>
    setPreview({
      target: {
        id: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        components: t.components,
        body: t.body,
      },
      template: waAsTemplate(t),
      isLocal: false,
    });

  const previewLocal = (t: MessageTemplate) =>
    setPreview({
      target: { id: t.id, name: t.name, body: t.body },
      template: t,
      isLocal: true,
    });




  const startCreate = () => {
    const term = search.trim();
    setName((n) => n || term);
    setCreating(true);
  };

  const saveTemplate = async () => {
    if (!name.trim() || !body.trim()) {
      toast.error("Name and message are required");
      return;
    }
    try {
      await createTemplate.mutateAsync({
        name: name.trim(),
        body: body.trim(),
        shortcut: shortcut.replace(/^\//, "").trim() || null,
      });
      toast.success("Saved reply created");
      setCreating(false);
      setName("");
      setShortcut("");
      setBody("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save template");
    }
  };

  if (creating) {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <div className="p-4 space-y-3">
          <div className="text-sm font-medium">New saved reply</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name" className="text-xs">Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Order status update"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-shortcut" className="text-xs">Shortcut (optional)</Label>
              <Input
                id="tpl-shortcut"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="order"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-body" className="text-xs">Message</Label>
            <Textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Hi {{contact_name}}, your order is on its way!"
            />
            <p className="text-[11px] text-muted-foreground">
              Use {"{{"}variable{"}}"} placeholders — they are filled in automatically when inserted.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={saveTemplate} disabled={createTemplate.isPending}>
              {createTemplate.isPending ? "Saving" : "Save reply"}
            </Button>
          </div>
        </div>
      </CommandDialog>
    );
  }

  return (
    <>
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search saved replies, templates, /shortcuts"
        value={search}
        onValueChange={setSearch}
      />
      {syncBar}
      <CommandList>
        {isLoading || waLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Loading
          </div>
        ) : templates.length === 0 && (waData?.templates?.length ?? 0) === 0 ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-xs text-muted-foreground">
              No templates yet. Create your first saved reply.
            </p>
            <Button size="sm" onClick={startCreate}>
              <Plus className="h-4 w-4" /> New saved reply
            </Button>
          </div>
        ) : (
          <>
            {waTemplates.length > 0 && (
              <CommandGroup heading="WhatsApp templates (approved)">
                {waTemplates.map((t) => (
                  <CommandItem
                    key={`wa-${t.id}`}
                    value={`${t.name} ${t.body}`}
                    onSelect={() => pickWa(t)}
                    className="flex items-start gap-2 py-2"
                  >
                    <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">{t.name}</span>
                        <Badge variant="outline" className="h-4 px-1 text-[11px]">
                          {t.category.toLowerCase()}
                        </Badge>
                        <Badge variant="outline" className="h-4 px-1 text-[11px] font-mono">
                          {t.language}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.body.replace(/\s+/g, " ")}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label={`Preview ${t.name}`}
                      title="Preview with variables"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        previewWa(t);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {onPickAndSend && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={`Send ${t.name} now`}
                        title="Send now"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          sendWa(t);
                        }}
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </CommandItem>

                ))}
              </CommandGroup>
            )}
            {waTemplates.length > 0 && templates.length > 0 && <CommandSeparator />}

            <CommandEmpty>
              <div className="p-4 text-center space-y-3">
                <p className="text-xs text-muted-foreground">No matching templates.</p>
                <Button size="sm" onClick={startCreate}>
                  <Plus className="h-4 w-4" /> New saved reply
                </Button>
              </div>
            </CommandEmpty>
            {favorites.length > 0 && (
              <CommandGroup heading="Favorites">
                {favorites.map((t) => (
                  <TemplateRow key={t.id} template={t} onSelect={() => pick(t)} onSend={onPickAndSend ? () => sendNow(t) : undefined} onPreview={() => previewLocal(t)} icon="star" />
                ))}
              </CommandGroup>
            )}
            {recent.length > 0 && (
              <>
                {favorites.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Recently used">
                  {recent.map((t) => (
                    <TemplateRow key={t.id} template={t} onSelect={() => pick(t)} onSend={onPickAndSend ? () => sendNow(t) : undefined} onPreview={() => previewLocal(t)} icon="clock" />
                  ))}
                </CommandGroup>
              </>
            )}
            {others.length > 0 && (
              <>
                {(favorites.length > 0 || recent.length > 0) && <CommandSeparator />}
                <CommandGroup heading="All templates">
                  {others.map((t) => (
                    <TemplateRow key={t.id} template={t} onSelect={() => pick(t)} onSend={onPickAndSend ? () => sendNow(t) : undefined} onPreview={() => previewLocal(t)} icon="file" />
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
      <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground flex items-center gap-3">
        <span className="flex items-center gap-1">
          <CommandIcon className="h-3 w-3" />
          <kbd className="px-1 rounded bg-muted">↑↓</kbd> to navigate
        </span>
        <span>
          <kbd className="px-1 rounded bg-muted">↵</kbd> to insert
        </span>
        {onPickAndSend && (
          <span className="flex items-center gap-1">
            <Send className="h-3 w-3" /> to send now
          </span>
        )}

        <span>
          <kbd className="px-1 rounded bg-muted">esc</kbd> to close
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-[11px]"
          onClick={startCreate}
        >
          <Plus className="h-3 w-3" /> New
        </Button>
      </div>
    </CommandDialog>
    <TemplatePreviewDialog
      open={!!preview}
      onOpenChange={(v) => { if (!v) setPreview(null); }}
      template={preview?.target ?? null}
      contextVars={contextVars}
      contact={contact}
      onInsert={(rendered) => {
        if (!preview) return;
        onPick(rendered, preview.template);
        if (preview.isLocal) registerUsage.mutate(preview.template);
        setPreview(null);
        close();
      }}
      onSend={onPickAndSend ? (rendered, _values, payload) => {
        if (!preview) return;
        void onPickAndSend(rendered, preview.template, payload ?? undefined);
        if (preview.isLocal) registerUsage.mutate(preview.template);
        setPreview(null);
        close();
      } : undefined}
    />
    </>
  );
}

function TemplateRow({
  template,
  onSelect,
  onSend,
  onPreview,
  icon,
}: {
  template: MessageTemplate;
  onSelect: () => void;
  onSend?: (() => void) | undefined;
  onPreview?: (() => void) | undefined;
  icon: "star" | "clock" | "file";
}) {

  const Icon = icon === "star" ? Star : icon === "clock" ? Clock : FileText;
  return (
    <CommandItem
      value={`${template.name} ${template.shortcut ?? ""} ${template.body}`}
      onSelect={onSelect}
      className="flex items-start gap-2 py-2"
    >
      <Icon
        className={
          icon === "star"
            ? "h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0"
            : "h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0"
        }
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{template.name}</span>
          {template.shortcut && (
            <Badge variant="outline" className="h-4 px-1 text-[11px] font-mono">
              /{template.shortcut}
            </Badge>
          )}
          {template.usage_count > 0 && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              <Zap className="h-3 w-3" />
              {template.usage_count}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {template.body.replace(/\s+/g, " ")}
        </div>
      </div>
      {onPreview && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={`Preview ${template.name}`}
          title="Preview with variables"
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}
      {onSend && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={`Send ${template.name} now`}
          title="Send now"
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onSend();
          }}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      )}
    </CommandItem>

  );
}
