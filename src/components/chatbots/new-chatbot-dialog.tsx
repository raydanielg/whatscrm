import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Sparkles,
  Headphones,
  ShoppingBag,
  HelpCircle,
  Users,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Database,
  AlertTriangle,
  UserRoundCog,
  Upload,
  FileText,
  X,
  MessageCircle,
  Send,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  upsertChatbot,
  setChatbotKbSources,
  ingestInlineKbDocs,
  chatbotChat,
} from "@/lib/chatbots/chatbots.functions";

import { listKbCollections, listKbArticles } from "@/lib/kb/kb.functions";
import { cn } from "@/lib/utils";
import { z } from "zod";

type TemplateKey = "blank" | "support" | "sales" | "faq" | "lead";
type RagScope = "all" | "collection" | "articles" | "none";
type HandoffTarget = "any" | "queue" | "agent";

type PendingDoc = {
  clientId: string;
  title: string;
  filename: string;
  content: string;
  sourceType: "markdown" | "txt" | "csv";
  size: number;
};

type PresetDefaults = {
  name: string;
  description: string;
  tone: string;
  welcome_message: string;
  fallback_message: string;
  system_prompt: string;
  rag_enabled: boolean;
  rag_scope: RagScope;
  rag_confidence: number;
  rag_collection_id: string | null;
  rag_article_ids: string[];
  handoff_enabled: boolean;
  handoff_target: HandoffTarget;
  handoff_business_hours_only: boolean;
};

type Preset = {
  key: TemplateKey;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  requires: { rag?: boolean; handoff?: boolean };
  defaults: PresetDefaults;
};

const PRESETS: Preset[] = [
  {
    key: "blank",
    title: "Blank",
    desc: "Start from scratch with a minimal setup.",
    icon: Sparkles,
    requires: {},
    defaults: {
      name: "New Chatbot",
      description: "",
      tone: "friendly",
      welcome_message: "Hi! How can I help you today?",
      fallback_message: "Sorry, I didn't quite get that. Could you rephrase?",
      system_prompt: "You are a helpful assistant.",
      rag_enabled: false,
      rag_scope: "none",
      rag_confidence: 0.7,
      handoff_enabled: false,
      handoff_target: "any",
      handoff_business_hours_only: false,
      rag_collection_id: null,
      rag_article_ids: [],
    },
  },
  {
    key: "support",
    title: "Customer Support",
    desc: "Answer questions grounded in your knowledge base with human handoff.",
    icon: Headphones,
    requires: { rag: true, handoff: true },
    defaults: {
      name: "Support Assistant",
      description: "Handles product questions and escalates to a human when needed.",
      tone: "professional",
      welcome_message: "Hi! I'm your support assistant. What can I help you with?",
      fallback_message: "Let me connect you with a human agent.",
      system_prompt:
        "You are a helpful customer support agent. Answer using the provided knowledge base. If unsure, offer to hand off to a human.",
      rag_enabled: true,
      rag_scope: "all",
      rag_confidence: 0.7,
      handoff_enabled: true,
      handoff_target: "queue",
      handoff_business_hours_only: true,
      rag_collection_id: null,
      rag_article_ids: [],
    },
  },
  {
    key: "sales",
    title: "Sales Assistant",
    desc: "Qualify leads, recommend products, and book demos.",
    icon: ShoppingBag,
    requires: { handoff: true },
    defaults: {
      name: "Sales Assistant",
      description: "Qualifies leads and recommends the best plan or product.",
      tone: "enthusiastic",
      welcome_message: "Hey there! Looking for the right fit? I can help.",
      fallback_message: "Want me to connect you with a sales rep?",
      system_prompt:
        "You are a friendly sales assistant. Ask qualifying questions, recommend solutions, and offer to book a demo when appropriate.",
      rag_enabled: true,
      rag_scope: "collection",
      rag_confidence: 0.65,
      handoff_enabled: true,
      handoff_target: "agent",
      handoff_business_hours_only: true,
      rag_collection_id: null,
      rag_article_ids: [],
    },
  },
  {
    key: "faq",
    title: "FAQ Bot",
    desc: "Instantly answers frequently asked questions from your knowledge base.",
    icon: HelpCircle,
    requires: { rag: true },
    defaults: {
      name: "FAQ Bot",
      description: "Answers common questions from your knowledge base.",
      tone: "concise",
      welcome_message: "Ask me anything about our product!",
      fallback_message: "I couldn't find that in our docs. Try rephrasing?",
      system_prompt:
        "You answer FAQs strictly from the provided knowledge base. Keep answers short and cite sources when possible.",
      rag_enabled: true,
      rag_scope: "all",
      rag_confidence: 0.75,
      handoff_enabled: false,
      handoff_target: "any",
      handoff_business_hours_only: false,
      rag_collection_id: null,
      rag_article_ids: [],
    },
  },
  {
    key: "lead",
    title: "Lead Generation",
    desc: "Collect visitor info and hand off qualified leads to your team.",
    icon: Users,
    requires: { handoff: true },
    defaults: {
      name: "Lead Gen Bot",
      description: "Collects contact info and qualifies inbound leads.",
      tone: "friendly",
      welcome_message: "Welcome! Mind if I ask a couple of quick questions?",
      fallback_message: "No worries — a team member will follow up shortly.",
      system_prompt:
        "You collect name, email, company, and use case from visitors, then hand them off to sales.",
      rag_enabled: false,
      rag_scope: "none",
      rag_confidence: 0.7,
      handoff_enabled: true,
      handoff_target: "queue",
      handoff_business_hours_only: false,
      rag_collection_id: null,
      rag_article_ids: [],
    },
  },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "no", label: "Norwegian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
];

const TONES = ["friendly", "professional", "enthusiastic", "concise", "playful", "formal"];

const configSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
    description: z.string().max(2000).optional(),
    language: z.string().min(2),
    tone: z.string().min(2),
    welcome_message: z.string().trim().min(1, "Welcome message is required").max(1000),
    rag_enabled: z.boolean(),
    rag_scope: z.enum(["all", "collection", "articles", "none"]),
    rag_confidence: z.number().min(0).max(1),
    rag_collection_id: z.string().uuid().nullable(),
    rag_article_ids: z.array(z.string().uuid()),
    rag_pending_doc_count: z.number().int().min(0),
    handoff_enabled: z.boolean(),
    handoff_target: z.enum(["any", "queue", "agent"]),
  })
  .superRefine((v, ctx) => {
    if (v.rag_enabled && v.rag_scope === "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rag_scope"],
        message: "Pick a knowledge source when RAG is enabled.",
      });
    }
    if (v.rag_enabled && v.rag_scope === "collection" && !v.rag_collection_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rag_collection_id"],
        message: "Select a collection to ground answers in.",
      });
    }
    if (
      v.rag_enabled &&
      v.rag_scope === "articles" &&
      v.rag_article_ids.length === 0 &&
      v.rag_pending_doc_count === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rag_article_ids"],
        message: "Pick at least one document or upload one.",
      });
    }
    if (v.handoff_enabled && v.handoff_target === "any") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["handoff_target"],
        message: "Choose where to route escalations.",
      });
    }
  });

export function NewChatbotDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string | undefined;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [createdBotId, setCreatedBotId] = useState<string | null>(null);
  const [testMessages, setTestMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [testSessionId, setTestSessionId] = useState<string | null>(null);
  const [testInput, setTestInput] = useState("");
  const [testSending, setTestSending] = useState(false);
  const testScrollRef = useRef<HTMLDivElement | null>(null);

  const [preset, setPreset] = useState<TemplateKey>("blank");
  const [form, setForm] = useState<PresetDefaults>(PRESETS[0].defaults);
  const [language, setLanguage] = useState("en");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const kbCollectionsQ = useQuery({
    queryKey: ["kb-collections", workspaceId],
    queryFn: () => listKbCollections({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId && open,
    staleTime: 30_000,
  });
  const kbArticlesQ = useQuery({
    queryKey: ["kb-articles-picker", workspaceId],
    queryFn: () => listKbArticles({ data: { workspaceId: workspaceId!, limit: 200 } }),
    enabled: !!workspaceId && open && form.rag_enabled && form.rag_scope === "articles",
    staleTime: 30_000,
  });

  const storageKey = useMemo(
    () => (workspaceId ? `wacrm:new-chatbot-draft:${workspaceId}` : null),
    [workspaceId],
  );
  const skipNextSave = useRef(false);

  // Restore draft when the dialog opens
  useEffect(() => {
    if (!open || !storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const d = JSON.parse(raw) as {
          step?: 1 | 2;
          preset?: TemplateKey;
          form?: PresetDefaults;
          language?: string;
        };
        skipNextSave.current = true;
        if (d.preset) setPreset(d.preset);
        if (d.form) setForm(d.form);
        if (d.language) setLanguage(d.language);
        if (d.step) setStep(d.step);
        setHasDraft(true);
        toast.info("Draft restored", {
          description: "Picked up where you left off.",
        });
      } else {
        setHasDraft(false);
      }
    } catch {
      // ignore corrupt draft
    }
    setDraftLoaded(true);
    return () => {
      setDraftLoaded(false);
    };
  }, [open, storageKey]);

  // Persist on change while open
  useEffect(() => {
    if (!open || !storageKey || !draftLoaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify({ step, preset, form, language }));
      setHasDraft(true);
    } catch {
      // ignore quota errors
    }
  }, [open, storageKey, draftLoaded, step, preset, form, language]);

  const clearDraft = () => {
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
    setHasDraft(false);
  };

  const currentPreset = useMemo(() => PRESETS.find((p) => p.key === preset)!, [preset]);

  // Incompatibility warnings vs the preset's requirements
  const warnings = useMemo(() => {
    const list: string[] = [];
    if (currentPreset.requires.rag && !form.rag_enabled) {
      list.push(
        `${currentPreset.title} works best with a knowledge base. Answers will be generic without it.`,
      );
    }
    if (currentPreset.requires.handoff && !form.handoff_enabled) {
      list.push(
        `${currentPreset.title} usually escalates to a human. Enable handoff or leads may go unattended.`,
      );
    }
    if (form.rag_enabled && form.rag_scope === "none") {
      list.push("Pick a knowledge source or turn off RAG.");
    }
    if (form.rag_enabled && form.rag_scope === "collection" && !form.rag_collection_id) {
      list.push("Choose a collection to ground answers in.");
    }
    if (
      form.rag_enabled &&
      form.rag_scope === "articles" &&
      form.rag_article_ids.length === 0 &&
      pendingDocs.length === 0
    ) {
      list.push("Pick documents or upload files for the knowledge source.");
    }

    if (form.handoff_enabled && form.handoff_target === "any") {
      list.push("Select a handoff destination (queue or agent).");
    }
    return list;
  }, [currentPreset, form, pendingDocs.length]);

  const applyPreset = (key: TemplateKey) => {
    const p = PRESETS.find((x) => x.key === key)!;
    setPreset(key);
    setForm(p.defaults);
    setPendingDocs([]);
    setErrors({});
  };

  const patch = (updates: Partial<PresetDefaults>) => {
    setForm((f) => {
      const next = { ...f, ...updates };
      // Keep dependent fields coherent
      if (updates.rag_enabled === false) {
        next.rag_scope = "none";
        next.rag_collection_id = null;
        next.rag_article_ids = [];
      }
      if (updates.rag_enabled === true && next.rag_scope === "none") next.rag_scope = "all";
      if (updates.rag_scope !== undefined) {
        if (updates.rag_scope !== "collection") next.rag_collection_id = null;
        if (updates.rag_scope !== "articles") next.rag_article_ids = [];
      }
      if (updates.handoff_enabled === false) next.handoff_target = "any";
      if (updates.handoff_enabled === true && next.handoff_target === "any")
        next.handoff_target = "queue";
      return next;
    });
  };

  const reset = () => {
    skipNextSave.current = true;
    setStep(1);
    setPreset("blank");
    setForm(PRESETS[0].defaults);
    setLanguage("en");
    setErrors({});
    setPendingDocs([]);
    setCreatedBotId(null);
    setTestMessages([]);
    setTestSessionId(null);
    setTestInput("");
    setTestSending(false);
  };

  const discardDraft = () => {
    clearDraft();
    reset();
    toast.success("Draft discarded");
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_BYTES = 512 * 1024; // 512KB per file
    const accepted: PendingDoc[] = [];
    const skipped: string[] = [];
    for (const file of Array.from(files)) {
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      const isText =
        ["txt", "md", "markdown", "csv"].includes(ext) || file.type.startsWith("text/");
      if (!isText) {
        skipped.push(`${file.name} (unsupported type)`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        skipped.push(`${file.name} (over 512KB)`);
        continue;
      }
      const content = await file.text();
      if (!content.trim()) {
        skipped.push(`${file.name} (empty)`);
        continue;
      }
      accepted.push({
        clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: file.name.replace(/\.[a-z0-9]+$/i, ""),
        filename: file.name,
        content,
        sourceType: ext === "md" || ext === "markdown" ? "markdown" : ext === "csv" ? "csv" : "txt",
        size: file.size,
      });
    }
    if (accepted.length) {
      setPendingDocs((prev) => [...prev, ...accepted]);
      // Switch to articles scope if user uploads while RAG on
      if (form.rag_enabled && form.rag_scope !== "articles") {
        patch({ rag_scope: "articles" });
      } else if (!form.rag_enabled) {
        patch({ rag_enabled: true, rag_scope: "articles" });
      }
      toast.success(`Added ${accepted.length} document${accepted.length > 1 ? "s" : ""}`);
    }
    if (skipped.length) {
      toast.warning(`Skipped ${skipped.length}`, {
        description: skipped.slice(0, 3).join(", "),
      });
    }
  };

  const removePendingDoc = (clientId: string) => {
    setPendingDocs((prev) => prev.filter((d) => d.clientId !== clientId));
  };

  const create = useMutation({
    mutationFn: async () => {
      // 1. Ingest any uploaded documents first so we have their IDs.
      let newArticleIds: string[] = [];
      if (form.rag_enabled && pendingDocs.length > 0) {
        const created = await ingestInlineKbDocs({
          data: {
            workspaceId: workspaceId!,
            docs: pendingDocs.map((d) => ({
              title: d.title,
              filename: d.filename,
              content: d.content,
              sourceType: d.sourceType,
            })),
          },
        });
        newArticleIds = created.map((r) => r.id);
      }
      // 2. Create the chatbot itself.
      const bot = await upsertChatbot({
        data: {
          workspaceId: workspaceId!,
          name: form.name,
          description: form.description || null,
          status: "draft",
          language,
          tone: form.tone,
          welcome_message: form.welcome_message,
          fallback_message: form.fallback_message,
          system_prompt: form.system_prompt,
          rag_enabled: form.rag_enabled,
          handoff_enabled: form.handoff_enabled,
        },
      });
      // 3. Attach knowledge sources based on scope.
      if (bot?.id && form.rag_enabled) {
        const articleIds =
          form.rag_scope === "articles"
            ? Array.from(new Set([...form.rag_article_ids, ...newArticleIds]))
            : newArticleIds; // if "all"/"collection" but user uploaded, still attach the new ones
        const categoryIds: string[] = [];
        if (form.rag_scope === "collection" && form.rag_collection_id) {
          // Store collection selection as a source (uses category_id column).
          categoryIds.push(form.rag_collection_id);
        }
        if (articleIds.length > 0 || categoryIds.length > 0) {
          await setChatbotKbSources({
            data: {
              chatbotId: bot.id,
              workspaceId: workspaceId!,
              articleIds,
              categoryIds,
            },
          });
        }
      }
      return bot;
    },
    onSuccess: (bot) => {
      toast.success("Chatbot created");
      qc.invalidateQueries({ queryKey: ["chatbots", workspaceId] });
      qc.invalidateQueries({ queryKey: ["kb-articles-picker", workspaceId] });
      clearDraft();
      if (bot?.id) {
        // Move into an in-dialog test flow so the user can verify replies
        // before leaving. Seed with the configured welcome message.
        setCreatedBotId(bot.id);
        setTestMessages(
          form.welcome_message ? [{ role: "assistant", content: form.welcome_message }] : [],
        );
        setTestSessionId(null);
        setTestInput("");
        setStep(3);
      } else {
        onOpenChange(false);
        reset();
      }
    },

    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-scroll test transcript as new messages come in.
  useEffect(() => {
    if (step !== 3) return;
    const el = testScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [step, testMessages, testSending]);

  const sendTestMessage = async () => {
    const text = testInput.trim();
    if (!text || !createdBotId || testSending) return;
    setTestInput("");
    setTestMessages((prev) => [...prev, { role: "user", content: text }]);
    setTestSending(true);
    try {
      const res = await chatbotChat({
        data: {
          chatbotId: createdBotId,
          sessionId: testSessionId ?? undefined,
          channel: "web",
          externalId: null,
          message: text,
        },
      });
      if (res.sessionId) setTestSessionId(res.sessionId);
      setTestMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply || form.fallback_message },
      ]);
    } catch (err) {
      const msg = (err as Error).message ?? "Failed to send message";
      toast.error(msg);
      setTestMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setTestSending(false);
    }
  };

  const goToBuilder = () => {
    const id = createdBotId;
    onOpenChange(false);
    reset();
    if (id) navigate({ to: "/chatbots/$botId/builder", params: { botId: id } });
  };

  const finishWithoutBuilder = () => {
    onOpenChange(false);
    reset();
  };

  const handleNext = () => {
    setErrors({});
    setStep(2);
  };

  const handleCreate = () => {
    const parsed = configSchema.safeParse({
      ...form,
      language,
      rag_pending_doc_count: pendingDocs.length,
    });

    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path.join(".")] = issue.message;
      }
      setErrors(errs);
      return;
    }
    create.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        // Do NOT reset on close — preserve draft so the user can resume.
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {step === 1
              ? "Choose a starting point"
              : step === 2
                ? "Configure your chatbot"
                : "Test your chatbot"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Pick a template and tune knowledge and handoff before continuing."
              : step === 2
                ? "Set the identity, tone, and behavior. You can change everything later in the builder."
                : "Send a message to verify replies. This uses your real prompt, RAG, and provider settings."}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
          <StepDot active={step >= 1} done={step > 1} label="Template" index={1} />
          <div className="h-px flex-1 bg-border" />
          <StepDot active={step >= 2} done={step > 2} label="Details" index={2} />
          <div className="h-px flex-1 bg-border" />
          <StepDot active={step >= 3} done={false} label="Test" index={3} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          {step === 1 && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PRESETS.map((p) => {
                  const Icon = p.icon;
                  const active = preset === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p.key)}
                      className={cn(
                        "text-left rounded-control border p-4 transition hover:border-primary/60 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        active ? "border-primary bg-primary/5" : "border-border bg-surface",
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="h-9 w-9 rounded-control bg-primary/10 text-primary flex items-center justify-center">
                          <Icon className="h-4 w-4" />
                        </div>
                        {active && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="mt-2 font-medium text-sm">{p.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {p.desc}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.requires.rag && (
                          <span className="text-[11px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            RAG
                          </span>
                        )}
                        {p.requires.handoff && (
                          <span className="text-[11px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            Handoff
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* RAG configuration */}
              <div className="rounded-control border border-border overflow-hidden">
                <label className="flex items-start justify-between gap-3 p-3 cursor-pointer">
                  <div className="flex items-start gap-2.5">
                    <Database className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <div className="text-sm font-medium">Knowledge base (RAG)</div>
                      <div className="text-xs text-muted-foreground">
                        Ground answers in your docs to reduce hallucinations.
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={form.rag_enabled}
                    onCheckedChange={(v) => patch({ rag_enabled: v })}
                  />
                </label>
                {form.rag_enabled && (
                  <div className="border-t border-border p-3 space-y-3 bg-muted/20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Knowledge source</Label>
                        <Select
                          value={form.rag_scope}
                          onValueChange={(v) => patch({ rag_scope: v as RagScope })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All workspace docs</SelectItem>
                            <SelectItem value="collection">Specific collection</SelectItem>
                            <SelectItem value="articles">Specific articles</SelectItem>
                          </SelectContent>
                        </Select>
                        {errors["rag_scope"] && (
                          <p className="text-xs text-destructive">{errors["rag_scope"]}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Confidence threshold</Label>
                          <span className="text-xs  text-muted-foreground">
                            {form.rag_confidence.toFixed(2)}
                          </span>
                        </div>
                        <Slider
                          min={0.3}
                          max={0.95}
                          step={0.05}
                          value={[form.rag_confidence]}
                          onValueChange={([v]) => patch({ rag_confidence: v })}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Below this, the bot uses the fallback message.
                        </p>
                      </div>
                    </div>

                    {/* Collection picker */}
                    {form.rag_scope === "collection" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Collection</Label>
                        <Select
                          value={form.rag_collection_id ?? ""}
                          onValueChange={(v) => patch({ rag_collection_id: v || null })}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                kbCollectionsQ.isLoading
                                  ? "Loading collections"
                                  : (kbCollectionsQ.data ?? []).length === 0
                                    ? "No collections yet"
                                    : "Select a collection"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {(kbCollectionsQ.data ?? []).map((c: { id: string; name: string }) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors["rag_collection_id"] && (
                          <p className="text-xs text-destructive">{errors["rag_collection_id"]}</p>
                        )}
                      </div>
                    )}

                    {/* Article multi-select */}
                    {form.rag_scope === "articles" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">
                            Articles ({form.rag_article_ids.length} selected)
                          </Label>
                        </div>
                        <div className="max-h-40 overflow-y-auto rounded-control border border-border bg-background divide-y divide-border">
                          {kbArticlesQ.isLoading && (
                            <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" /> Loading articles
                            </div>
                          )}
                          {!kbArticlesQ.isLoading && (kbArticlesQ.data ?? []).length === 0 && (
                            <div className="p-3 text-xs text-muted-foreground">
                              No articles yet — upload documents below.
                            </div>
                          )}
                          {(kbArticlesQ.data ?? []).map((a: { id: string; title: string }) => {
                            const checked = form.rag_article_ids.includes(a.id);
                            return (
                              <div
                                key={a.id}
                                className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted/40"
                              >
                                <Checkbox
                                  id={`kb-article-${a.id}`}
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    const next =
                                      v === true
                                        ? [...form.rag_article_ids, a.id]
                                        : form.rag_article_ids.filter((x) => x !== a.id);
                                    patch({ rag_article_ids: next });
                                  }}
                                />
                                <Label
                                  htmlFor={`kb-article-${a.id}`}
                                  className="truncate font-normal cursor-pointer"
                                >
                                  {a.title}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                        {errors["rag_article_ids"] && (
                          <p className="text-xs text-destructive">{errors["rag_article_ids"]}</p>
                        )}
                      </div>
                    )}

                    {/* Upload area */}
                    <div className="rounded-control border border-dashed border-border p-3 space-y-2 bg-background/40">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-medium">Upload documents</div>
                          <div className="text-[11px] text-muted-foreground">
                            .txt, .md, .csv up to 512KB each. Ingested into your knowledge base on
                            create.
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5 mr-1.5" /> Choose files
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            void addFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </div>
                      {pendingDocs.length > 0 && (
                        <ul className="space-y-1">
                          {pendingDocs.map((d) => (
                            <li
                              key={d.clientId}
                              className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs"
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{d.filename}</span>
                                <span className="text-muted-foreground shrink-0">
                                  {(d.size / 1024).toFixed(1)} KB
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => removePendingDoc(d.clientId)}
                                className="text-muted-foreground hover:text-destructive"
                                aria-label={`Remove ${d.filename}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Handoff configuration */}
              <div className="rounded-control border border-border overflow-hidden">
                <label className="flex items-start justify-between gap-3 p-3 cursor-pointer">
                  <div className="flex items-start gap-2.5">
                    <UserRoundCog className="h-4 w-4 mt-0.5 text-primary" />
                    <div>
                      <div className="text-sm font-medium">Human handoff</div>
                      <div className="text-xs text-muted-foreground">
                        Route to a live agent when the bot can't help.
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={form.handoff_enabled}
                    onCheckedChange={(v) => patch({ handoff_enabled: v })}
                  />
                </label>
                {form.handoff_enabled && (
                  <div className="border-t border-border p-3 space-y-3 bg-muted/20">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Route to</Label>
                        <Select
                          value={form.handoff_target}
                          onValueChange={(v) => patch({ handoff_target: v as HandoffTarget })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="queue">Support queue</SelectItem>
                            <SelectItem value="agent">Specific agent group</SelectItem>
                          </SelectContent>
                        </Select>
                        {errors["handoff_target"] && (
                          <p className="text-xs text-destructive">{errors["handoff_target"]}</p>
                        )}
                      </div>
                      <label className="flex items-start justify-between gap-3 rounded-control border border-border p-2.5 cursor-pointer">
                        <div>
                          <div className="text-xs font-medium">Business hours only</div>
                          <div className="text-[11px] text-muted-foreground">
                            Outside hours, offer a callback instead.
                          </div>
                        </div>
                        <Switch
                          checked={form.handoff_business_hours_only}
                          onCheckedChange={(v) => patch({ handoff_business_hours_only: v })}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {warnings.length > 0 && (
                <div className="rounded-control border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Compatibility notes
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cb-name">Name *</Label>
                  <Input
                    id="cb-name"
                    value={form.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="e.g. Support Assistant"
                    maxLength={120}
                  />
                  {errors["name"] && <p className="text-xs text-destructive">{errors["name"]}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cb-desc">Description</Label>
                <RichTextarea
                  id="cb-desc"
                  rows={2}
                  value={form.description}
                  onChange={(v) => patch({ description: v })}
                  placeholder="What does this chatbot do?"
                  maxLength={2000}
                />
                <p className="text-[11px] text-muted-foreground text-right">
                  {form.description.length}/2000
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Tone</Label>
                <Select value={form.tone} onValueChange={(v) => patch({ tone: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cb-welcome">Welcome message *</Label>
                <RichTextarea
                  id="cb-welcome"
                  rows={2}
                  value={form.welcome_message}
                  onChange={(v) => patch({ welcome_message: v })}
                  maxLength={1000}
                />
                {errors["welcome_message"] && (
                  <p className="text-xs text-destructive">{errors["welcome_message"]}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cb-fallback">Fallback message</Label>
                <RichTextarea
                  id="cb-fallback"
                  rows={2}
                  value={form.fallback_message}
                  onChange={(v) => patch({ fallback_message: v })}
                  maxLength={1000}
                />
              </div>

              <div className="rounded-control border border-border p-3 bg-muted/20 space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">RAG</span>
                  <span className="text-muted-foreground">
                    {form.rag_enabled
                      ? `${form.rag_scope === "all" ? "All docs" : "Specific collection"} · ≥${form.rag_confidence.toFixed(2)}`
                      : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <UserRoundCog className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">Handoff</span>
                  <span className="text-muted-foreground">
                    {form.handoff_enabled
                      ? `${form.handoff_target === "queue" ? "Support queue" : "Agent group"}${form.handoff_business_hours_only ? " · business hours" : ""}`
                      : "Disabled"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 mt-2">
              <div className="rounded-control border border-border overflow-hidden bg-background">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2 bg-muted/30">
                  <Bot className="h-4 w-4 text-primary" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{form.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Test conversation · not saved to sessions
                    </div>
                  </div>
                  <div className="ml-auto text-[11px] text-muted-foreground">
                    {form.rag_enabled ? "RAG on" : "RAG off"}
                    {form.handoff_enabled ? " · Handoff on" : ""}
                  </div>
                </div>
                <div
                  ref={testScrollRef}
                  className="h-72 overflow-y-auto px-3 py-3 space-y-3 bg-background"
                >
                  {testMessages.length === 0 && !testSending && (
                    <div className="text-center text-xs text-muted-foreground py-8">
                      Send your first message to see how the bot responds.
                    </div>
                  )}
                  {testMessages.map((m, i) => {
                    const isUser = m.role === "user";
                    return (
                      <div
                        key={i}
                        className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}
                      >
                        {!isUser && (
                          <div className="h-6 w-6 shrink-0 rounded-full bg-primary/15 grid place-items-center">
                            <Bot className="h-3.5 w-3.5 text-primary" />
                          </div>
                        )}
                        <div
                          className={cn(
                            "max-w-[75%] rounded-control px-3 py-2 text-sm whitespace-pre-wrap break-words",
                            isUser
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground",
                          )}
                        >
                          {m.content}
                        </div>
                        {isUser && (
                          <div className="h-6 w-6 shrink-0 rounded-full bg-muted grid place-items-center">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {testSending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="h-10 w-10 rounded-full bg-primary/15 grid place-items-center">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <Loader2 className="h-3 w-3 animate-spin" /> Thinking
                    </div>
                  )}
                </div>
                <div className="border-t border-border p-2 flex items-end gap-2 bg-muted/20">
                  <Textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendTestMessage();
                      }
                    }}
                    placeholder="Type a message to test the bot"
                    rows={2}
                    className="min-h-[44px] resize-none bg-background"
                    disabled={testSending || !createdBotId}
                  />
                  <Button
                    size="icon"
                    onClick={() => void sendTestMessage()}
                    disabled={testSending || !testInput.trim() || !createdBotId}
                    title="Send"
                  >
                    {testSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <MessageCircle className="h-3 w-3" />
                You can keep testing here or open the builder to fine-tune the flow.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-2">
          {step === 2 && (
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 " /> Back
            </Button>
          )}
          {step !== 3 && hasDraft && (
            <Button
              variant="ghost"
              size="sm"
              onClick={discardDraft}
              className="text-muted-foreground"
              title="Delete the saved draft and start over"
            >
              Discard draft
            </Button>
          )}
          <div className="flex-1" />
          {step !== 3 && hasDraft && (
            <span className="text-xs text-muted-foreground self-center ">Draft saved</span>
          )}

          {step === 3 ? (
            <>
              <Button variant="outline" size="sm" onClick={finishWithoutBuilder}>
                Done
              </Button>
              <Button size="sm" onClick={goToBuilder}>
                Open builder <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {step === 1 ? (
                <Button size="sm" onClick={handleNext} disabled={!workspaceId}>
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button size="sm" onClick={handleCreate} disabled={create.isPending}>
                  {create.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 " /> Create chatbot
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepDot({
  active,
  done,
  label,
  index,
}: {
  active: boolean;
  done: boolean;
  label: string;
  index: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn(
          "h-5 w-5 rounded-full grid place-items-center text-[11px] font-semibold",
          done
            ? "bg-primary text-primary-foreground"
            : active
              ? "bg-primary/15 text-primary border border-primary"
              : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="h-3 w-3" /> : String(index)}
      </div>
      <span className={cn(active || done ? "text-foreground" : "")}>{label}</span>
    </div>
  );
}
