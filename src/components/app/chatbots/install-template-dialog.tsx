import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Loader2,
  Rocket,
  ShieldCheck,
  BookOpen,
  UserRound,
  MessageSquare,
  Sparkles,
  Database,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import {
  cloneTemplateToChatbot,
  getChatbotTemplate,
  previewTemplateInstall,
} from "@/lib/chatbots/marketplace.functions";
import { useWorkspaces } from "@/hooks/use-workspace";
import { GitCompare, AlertTriangle, Plus, Minus, ArrowRightLeft } from "lucide-react";

type Step = "permissions" | "workspace" | "installing";

type TemplateCfg = {
  rag_enabled?: boolean;
  handoff_enabled?: boolean;
  handoff_keywords?: string[];
  model?: string;
  language?: string;
  tone?: string;
};

type TemplateFull = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  version: number;
  config: TemplateCfg | null;
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function InstallTemplateDialog({
  templateId,
  onClose,
}: {
  templateId: string | null;
  onClose: () => void;
}) {
  const open = !!templateId;
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("permissions");
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [name, setName] = useState<string>("");

  const tplQ = useQuery({
    queryKey: ["chatbot-template-install", templateId],
    enabled: open,
    queryFn: () => getChatbotTemplate({ data: { id: templateId! } }),
  });
  const wsQ = useWorkspaces();

  const tpl = (tplQ.data?.template ?? null) as TemplateFull | null;
  const cfg: TemplateCfg = tpl?.config ?? {};

  useEffect(() => {
    if (!open) {
      setStep("permissions");
      setWorkspaceId("");
      setName("");
    }
  }, [open]);

  useEffect(() => {
    if (tpl && !name) setName(tpl.name);
  }, [tpl, name]);

  useEffect(() => {
    if (wsQ.data?.length && !workspaceId) setWorkspaceId(wsQ.data[0].id as string);
  }, [wsQ.data, workspaceId]);

  const permissions = useMemo(() => {
    const list: { icon: React.ReactNode; label: string; detail: string }[] = [
      {
        icon: <MessageSquare className="h-4 w-4" />,
        label: "Send & receive messages on your behalf",
        detail: "The bot will reply to conversations in the workspace you choose.",
      },
      {
        icon: <Database className="h-4 w-4" />,
        label: "Store conversation history",
        detail: "Sessions and messages are saved so the bot has memory.",
      },
    ];
    if (cfg.rag_enabled)
      list.push({
        icon: <BookOpen className="h-4 w-4" />,
        label: "Read from your Knowledge Base",
        detail: "Retrieval-augmented answers using articles you've published.",
      });
    if (cfg.handoff_enabled)
      list.push({
        icon: <UserRound className="h-4 w-4" />,
        label: "Escalate to a human agent",
        detail: `Hands off when keywords like ${(cfg.handoff_keywords ?? [])
          .slice(0, 3)
          .join(", ") || "help, agent, human"} are detected.`,
      });
    if (cfg.model)
      list.push({
        icon: <Sparkles className="h-4 w-4" />,
        label: `Call the ${cfg.model} model`,
        detail: "Consumes AI credits on message generation.",
      });
    return list;
  }, [cfg]);

  const installMut = useMutation({
    mutationFn: () =>
      cloneTemplateToChatbot({
        data: {
          templateId: templateId!,
          workspaceId: workspaceId || undefined,
          name: name.trim() || undefined,
        },
      }),
    onSuccess: ({ chatbotId }) => {
      toast.success("Chatbot installed to your library");
      onClose();
      navigate({ to: "/chatbots/$botId", params: { botId: chatbotId } });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setStep("workspace");
    },
  });

  const debouncedName = useDebouncedValue(name.trim(), 300);
  const previewQ = useQuery({
    queryKey: ["chatbot-template-preview", templateId, workspaceId, debouncedName],
    enabled: open && step === "workspace" && !!templateId && !!workspaceId && !!debouncedName,
    queryFn: () =>
      previewTemplateInstall({
        data: { templateId: templateId!, workspaceId, name: debouncedName },
      }),
  });

  const loading = tplQ.isLoading;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !installMut.isPending && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {loading ? "Loading" : `Install ${tpl?.name ?? "template"}`}
          </DialogTitle>
          <DialogDescription>
            {step === "permissions" && "Review what this chatbot will be able to do."}
            {step === "workspace" && "Choose where to install it and rename if you like."}
            {step === "installing" && "Creating the chatbot in your library"}
          </DialogDescription>
        </DialogHeader>

        {loading || !tpl ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading template
          </div>
        ) : step === "permissions" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline">{tpl.category}</Badge>
              <Badge variant="outline">v{tpl.version}</Badge>
              {cfg.language && <Badge variant="outline">{cfg.language}</Badge>}
              {cfg.tone && <Badge variant="outline">{cfg.tone}</Badge>}
            </div>
            {tpl.description && (
              <p className="text-sm text-muted-foreground">{tpl.description}</p>
            )}
            <div className="rounded-control border border-border divide-y divide-border">
              {permissions.map((p, i) => (
                <div key={i} className="flex items-start gap-3 p-3">
                  <div className="h-8 w-8 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {p.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.detail}</div>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 ml-auto mt-1 shrink-0" />
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-control bg-muted/50 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              You can revoke or reconfigure any of these later from the chatbot settings.
            </div>
          </div>
        ) : step === "workspace" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws">Install to workspace</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger id="ws">
                  <SelectValue placeholder="Select a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {(wsQ.data ?? []).map((w) => (
                    <SelectItem key={w.id as string} value={w.id as string}>
                      {(w as { name?: string }).name ?? "Workspace"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {wsQ.isLoading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading workspaces
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bot-name">Chatbot name</Label>
              <Input
                id="bot-name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                placeholder={tpl.name}
              />
              <p className="text-[11px] text-muted-foreground">
                You can rename it anytime from the chatbot library.
              </p>
            </div>
            <DiffPanel query={previewQ} />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Installing
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === "permissions" && (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!tpl} onClick={() => setStep("workspace")}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === "workspace" && (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep("permissions")}
                disabled={installMut.isPending}
              >
                <ArrowLeft className="h-4 w-4 " /> Back
              </Button>
              <Button
                disabled={!workspaceId || !name.trim() || installMut.isPending}
                onClick={() => {
                  setStep("installing");
                  installMut.mutate();
                }}
              >
                {installMut.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4 " />
                )}
                Install to library
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DiffValue = string | number | boolean | string[] | null;
type PreviewResult = Awaited<ReturnType<typeof previewTemplateInstall>>;

function fmt(v: DiffValue): string {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  const s = String(v);
  return s.length > 140 ? s.slice(0, 140) + "" : s;
}

function DiffPanel({ query }: { query: { data?: PreviewResult; isLoading: boolean; isFetching: boolean } }) {
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking for existing chatbot
      </div>
    );
  }
  const data = query.data;
  if (!data) return null;

  if (!data.hasExisting) {
    return (
      <div className="flex items-start gap-2 rounded-control border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
        <Plus className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium text-emerald-700 dark:text-emerald-400">New chatbot</div>
          <div className="text-muted-foreground">
            No existing chatbot named “{data.template.name}” in this workspace. A fresh one will be created.
          </div>
        </div>
      </div>
    );
  }

  const { existing, diffs, template } = data;

  return (
    <div className="rounded-control border border-border">
      <div className="flex items-start gap-2 p-3 border-b border-border bg-muted/40">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
            Existing chatbot found
            <Badge variant="outline" className="capitalize text-[11px]">{existing.status}</Badge>
            {existing.disabled && <Badge variant="outline" className="text-[11px] text-amber-600 border-amber-500/40">Disabled</Badge>}
            {existing.installedFromSameTemplate && <Badge variant="outline" className="text-[11px]">Same template</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            Installing will create a second chatbot named “{existing.name}”. Rename above to install as a new bot, or
            update the existing one from its settings.
          </div>
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <GitCompare className="h-3.5 w-3.5 text-primary" />
          Diff vs template v{template.version}
          {query.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        {diffs.length === 0 ? (
          <div className="text-xs text-muted-foreground">No configuration changes — the existing chatbot already matches this template.</div>
        ) : (
          <ul className="space-y-1.5">
            {diffs.map((d) => (
              <li key={d.key} className="rounded-control border border-border/60 p-2 text-xs">
                <div className="flex items-center gap-1.5 font-medium">
                  {d.status === "added" && <Plus className="h-3 w-3 text-emerald-600" />}
                  {d.status === "removed" && <Minus className="h-3 w-3 text-destructive" />}
                  {d.status === "changed" && <ArrowRightLeft className="h-3 w-3 text-amber-600" />}
                  {d.label}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-muted-foreground mb-0.5">Current</div>
                    <div className="rounded bg-destructive/5 border border-destructive/20 px-1.5 py-1 break-words">{fmt(d.current)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Incoming</div>
                    <div className="rounded bg-emerald-500/5 border border-emerald-500/20 px-1.5 py-1 break-words">{fmt(d.incoming)}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

