import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Paperclip,
  Send,
  Smile,
  Image as ImageIcon,
  FileText,
  ClipboardList,
  MapPin,
  User as UserIcon,
  Mic,
  Square,
  X,
  Reply as ReplyIcon,
  Zap,
  Clock,
  CalendarClock,
  ChevronDown,
  Keyboard,
  BookOpen,
  Command as CommandIcon,
  UserCheck,
  Music,
  ShoppingBag,
  MoreHorizontal,
  Sticker as StickerIcon,
  ListChecks,
  CalendarPlus,
  Plus,
  Minus,
  MessageSquareText,
  FolderKanban,
  Save,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Code2,
  Quote,
  List,
  Eye,
  Globe2,
  Lock,
} from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useActiveOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useSendMessage,
  useBroadcastTyping,
  uploadAttachment,
  type MessageRow,
  type MessageMetadata,
} from "@/hooks/use-messages";
import type { InboxChannel } from "@/hooks/use-conversations";
import { channelCan, channelLabel } from "@/lib/inbox/channel-capabilities";
import {
  acceptFor,
  channelAllows,
  checkAttachment,
  isAnimatedWebp,
  type AttachmentKind,
} from "@/lib/inbox/channel-attachments";
import { validatePoll, POLL_MAX_OPTIONS, POLL_MIN_OPTIONS } from "@/lib/inbox/poll";
import { buildEventIcs, icsFileName } from "@/lib/inbox/event-ics";
import { ProductPicker } from "@/components/app/inbox/product-picker";
import { ProjectUpdatePicker } from "@/components/app/inbox/project-update-picker";
import { QuickReplyPicker } from "@/components/app/inbox/quick-reply-picker";
import { listQuickReplies, bumpQuickReplyUsage } from "@/lib/inbox/quick-replies.functions";
import { insertAtCursor } from "@/lib/inbox/insert-at-cursor";
import {
  toggleWrap,
  togglePrefix,
  wrapCodeBlock,
  hasFormatting,
  extractFirstUrl,
  type FormatMarker,
} from "@/lib/inbox/rich-text";
import { FormattedText } from "@/components/app/inbox/formatted-text";
import type { TemplateSendPayload } from "@/lib/messaging/template-send-payload";

import {
  useMessageDraft,
  useSaveDraft,
  useMessageTemplates,
  useScheduledMessages,
  useRegisterTemplateUsage,
  renderTemplate,
  type MessageTemplate,
} from "@/hooks/use-productivity";
import { useAuth } from "@/hooks/use-auth";
import { TemplatePicker } from "@/components/app/inbox/template-picker";
import { WhatsAppFormPicker } from "@/components/app/inbox/whatsapp-form-picker";
import { useContact } from "@/hooks/use-contacts";
import { AIReplyAssistant } from "@/components/app/inbox/ai-reply-assistant";
import { TemplateManager } from "@/components/app/inbox/template-manager";
import { ScheduleDialog } from "@/components/app/inbox/schedule-dialog";
import { EmojiPicker } from "@/components/app/inbox/emoji-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useContactSearch,
  useCreateWorkspaceContact,
  type ContactSearchResult,
} from "@/hooks/use-contact-linking";
import { normalizePhone } from "@/lib/inbox/contact-display";
import { digitsOnly } from "@/lib/messaging/phone-matching";
import { SchedulePicker } from "@/components/app/social/schedule-picker";

/* -------------------------------------------------------------------------- */

type PrefillSource = "attachment" | "recipient";
type PendingAttachment = {
  file: File;
  messageType: "image" | "video" | "audio" | "document" | "sticker";
  previewUrl: string | null;
};

const WHATSAPP_STICKER_EDGE = 512;
const WHATSAPP_STATIC_STICKER_MAX = 100 * 1024;

async function loadStickerImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convert a static WebP into WhatsApp's required transparent 512×512 sticker. */
async function normalizeWhatsAppSticker(file: File): Promise<File> {
  const image = await loadStickerImage(file);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("The sticker image could not be read.");
  }
  if (
    image.naturalWidth === WHATSAPP_STICKER_EDGE &&
    image.naturalHeight === WHATSAPP_STICKER_EDGE &&
    file.size <= WHATSAPP_STATIC_STICKER_MAX
  ) {
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = WHATSAPP_STICKER_EDGE;
  canvas.height = WHATSAPP_STICKER_EDGE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare the sticker image.");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  ctx.drawImage(
    image,
    Math.round((canvas.width - width) / 2),
    Math.round((canvas.height - height) / 2),
    width,
    height,
  );

  const toWebp = (quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("WebP sticker conversion failed."))),
        "image/webp",
        quality,
      );
    });

  let output: Blob | null = null;
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
    output = await toWebp(quality);
    if (output.size <= WHATSAPP_STATIC_STICKER_MAX) break;
  }
  if (!output || output.size > WHATSAPP_STATIC_STICKER_MAX) {
    throw new Error("The sticker could not be reduced below WhatsApp's 100 KB limit.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "sticker";
  return new File([output], `${baseName}.webp`, { type: "image/webp" });
}

type ContactPrefill = {
  name?: string;
  phone?: string;
  email?: string;
  source?: PrefillSource;
  existingContactId?: string | null;
};

type Props = {
  conversationId: string;
  workspaceId: string;
  replyTo: MessageRow | null;
  onClearReply: () => void;
  disabled?: boolean;
  /** Channel of the conversation — gates unsupported composer affordances. */
  channel?: InboxChannel;
  /** Prefill candidates for the "Share contact" modal, highest priority first. */
  contactPrefill?: ContactPrefill[];
  /** CRM contact linked to the conversation — powers template auto-suggest. */
  contactId?: string | null;
};

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const mod = IS_MAC ? "⌘" : "Ctrl";

export function MessageComposer({
  conversationId,
  workspaceId,
  replyTo,
  onClearReply,
  disabled: disabledProp,
  channel,
  contactPrefill,
  contactId,
}: Props) {
  // RBAC: `inbox.reply` gates every outbound action in this composer.
  // `my_permissions()` resolves the org owner/admin fallback only when an
  // organization id is supplied, so an unresolved active org yields an empty
  // set — treat that as "still loading" rather than locking the user out.
  const { active: activeOrg } = useActiveOrganization();
  const { can: hasPermission, loading: permissionsLoading } = usePermissions();
  const permissionsPending = permissionsLoading || !activeOrg?.id;
  const canReply = permissionsPending ? true : hasPermission("inbox.reply");
  const disabled = disabledProp || !canReply;

  const can = (cap: Parameters<typeof channelCan>[1]) => channelCan(channel, cap);
  // Attachment options come from the shared per-channel map (also enforced
  // server-side in outbound.server.ts). Unknown channel = do not restrict.
  const allow = (kind: AttachmentKind) => !channel || channelAllows(channel, kind);

  const [text, setText] = useState("");
  const draftUrl = useMemo(() => extractFirstUrl(text), [text]);
  const [isRecording, setIsRecording] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formPickerOpen, setFormPickerOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [projectUpdatePickerOpen, setProjectUpdatePickerOpen] = useState(false);
  const [quickReplyPickerOpen, setQuickReplyPickerOpen] = useState(false);
  const [quickReplyDraftToSave, setQuickReplyDraftToSave] = useState<string | undefined>(undefined);
  const [pickerSeed, setPickerSeed] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", email: "" });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [dupeQuery, setDupeQuery] = useState("");
  const [linkedContactId, setLinkedContactId] = useState<string | null>(null);
  const [dupeDismissed, setDupeDismissed] = useState(false);
  const [prefillIdx, setPrefillIdx] = useState<number>(-1);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [slashDismissedKey, setSlashDismissedKey] = useState<string | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollSubmitting, setPollSubmitting] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "",
    start: "",
    end: "",
    location: "",
    description: "",
  });
  const [eventSubmitting, setEventSubmitting] = useState(false);

  const send = useSendMessage();
  const createContact = useCreateWorkspaceContact(workspaceId);
  const broadcastTyping = useBroadcastTyping(conversationId);
  const { user } = useAuth();
  const { data: draft } = useMessageDraft(conversationId);
  const saveDraft = useSaveDraft();
  const { data: templates = [] } = useMessageTemplates();
  const { data: scheduledPending = [] } = useScheduledMessages(conversationId);
  const registerUsage = useRegisterTemplateUsage();
  // Same query key the quick-reply picker uses (search: "") so both share one cache
  // entry, and /shortcut expansion works without opening the picker first.
  const fnListQuickReplies = useServerFn(listQuickReplies);
  const fnBumpQuickReplyUsage = useServerFn(bumpQuickReplyUsage);
  const { data: quickReplies = [] } = useQuery({
    queryKey: ["quick-replies", workspaceId, ""],
    enabled: !!workspaceId,
    queryFn: () => fnListQuickReplies({ data: { workspaceId: workspaceId! } }),
  });
  const { data: crmContact } = useContact(contactId ?? undefined);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const draftLoadedRef = useRef<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Object URLs are local previews only. Revoke them when a file is replaced,
  // removed, sent, or the composer switches to another conversation.
  useEffect(() => {
    const previewUrl = pendingAttachment?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [pendingAttachment?.previewUrl]);

  useEffect(() => {
    setPendingAttachment(null);
  }, [conversationId]);

  /* --------------------------- Focus / autosize --------------------------- */

  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId, replyTo?.id]);

  // External focus request (keyboard shortcut "r")
  useEffect(() => {
    const onFocus = () => {
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener("inbox:focus-composer", onFocus);
    return () => window.removeEventListener("inbox:focus-composer", onFocus);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  }, [text]);

  /* ------------------------------ Formatting ------------------------------ */

  // Messages go out as plain text with WhatsApp's markers (*bold*, _italic_,
  // ~strike~, `mono`, ``` blocks). The toolbar only types those markers for
  // you, so the wire format is unchanged on every channel.
  const [showPreview, setShowPreview] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);

  const applyFormat = useCallback(
    (
      transform: (
        value: string,
        selectionStart: number,
        selectionEnd: number,
      ) => { text: string; selectionStart: number; selectionEnd: number },
    ) => {
      const el = textareaRef.current;
      if (!el) return;
      const next = transform(text, el.selectionStart, el.selectionEnd);
      setText(next.text);
      // The value lands on the next render — restore the caret after it.
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(next.selectionStart, next.selectionEnd);
      });
    },
    [text],
  );

  const wrapWith = useCallback(
    (marker: FormatMarker) => applyFormat((v, a, b) => toggleWrap(v, a, b, marker)),
    [applyFormat],
  );

  /* -------------------------------- Drafts -------------------------------- */

  // Load draft when switching conversations
  useEffect(() => {
    if (draftLoadedRef.current === conversationId) return;
    if (draft === undefined) return; // still loading
    draftLoadedRef.current = conversationId;
    setText(draft?.body ?? "");
  }, [conversationId, draft]);

  // Debounced autosave
  useEffect(() => {
    if (draftLoadedRef.current !== conversationId) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft.mutate({ conversation_id: conversationId, body: text });
    }, 700);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, conversationId]);

  /* --------------------------- Template resolution ------------------------ */

  const contextVars = {
    agent_name: user?.email?.split("@")[0] ?? "there",
  };

  const applyTemplate = useCallback(
    (rendered: string, template?: MessageTemplate) => {
      setText((t) => (t.trim().length === 0 ? rendered : `${t.trim()} ${rendered}`));
      if (template) registerUsage.mutate(template);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [registerUsage],
  );

  /** Insert a quick reply's body at the current caret position (or append). */
  const insertQuickReply = useCallback(
    (body: string) => {
      const el = textareaRef.current;
      const selStart = el?.selectionStart ?? text.length;
      const selEnd = el?.selectionEnd ?? text.length;
      setText((t) => {
        const { text: next } = insertAtCursor(t, selStart, selEnd, body);
        return next;
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [text],
  );

  /** One-click: send a template straight to the conversation. */
  const sendTemplateNow = useCallback(
    async (rendered: string, template: MessageTemplate, payload?: TemplateSendPayload) => {
      const body = rendered.trim();
      if (!body) return;
      onClearReply();
      try {
        const metadata: MessageMetadata = payload
          ? {
              template_name: payload.name,
              template_language: payload.language,
              template_components: payload.components,
            }
          : {};
        await send.mutateAsync({
          conversationId,
          body,
          messageType: payload ? "template" : "text",
          replyToId: replyTo?.id ?? null,
          metadata,
        });
        saveDraft.mutate({ conversation_id: conversationId, body: "" });
      } catch (e) {
        toast.error("Could not send template", {
          description: String((e as Error).message),
        });
        applyTemplate(rendered);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, replyTo?.id, send, saveDraft, onClearReply, applyTemplate],
  );

  // Slash-command inline: if the user types /shortcut and hits space or enter, expand.
  // Checks message templates first (existing behaviour), then quick replies.
  const tryExpandShortcut = useCallback((): boolean => {
    const match = text.match(/(^|\s)\/([a-z0-9_-]{1,32})$/i);
    if (!match) return false;
    const shortcut = match[2].toLowerCase();
    const before = text.slice(0, match.index! + match[1].length);

    const template = templates.find((t) => t.shortcut && t.shortcut.toLowerCase() === shortcut);
    if (template) {
      const rendered = renderTemplate(template.body, contextVars);
      setText(before + rendered);
      registerUsage.mutate(template);
      return true;
    }

    const quickReply = quickReplies.find(
      (q) => q.shortcut && q.shortcut.toLowerCase() === shortcut,
    );
    if (quickReply) {
      setText(before + quickReply.body);
      void fnBumpQuickReplyUsage({ data: { id: quickReply.id } }).catch(() => {
        /* usage count is a nice-to-have, never block the expand on it */
      });
      return true;
    }

    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, templates, quickReplies]);

  /* ----------------------- "/" suggestion dropdown ------------------------ */

  // Matches a live, unconfirmed /shortcut at the end of the text — e.g. "/th"
  // while the user is still typing it, before they press space/Enter/Tab.
  const slashMatch = useMemo(() => text.match(/(^|\s)\/([a-z0-9_-]{0,32})$/i), [text]);
  const slashKey = slashMatch ? slashMatch[0] : null;
  const slashQuery = slashMatch ? slashMatch[2].toLowerCase() : null;

  type SlashSuggestion = {
    key: string;
    shortcut: string;
    title: string;
    preview: string;
    badge: "Template" | "Quick reply";
    apply: (before: string) => void;
  };

  const slashSuggestions = useMemo<SlashSuggestion[]>(() => {
    if (slashQuery === null) return [];
    const seen = new Set<string>();
    const out: SlashSuggestion[] = [];
    for (const t of templates) {
      const sc = t.shortcut?.toLowerCase();
      if (!sc || !sc.startsWith(slashQuery) || seen.has(sc)) continue;
      seen.add(sc);
      out.push({
        key: `t:${t.id}`,
        shortcut: sc,
        title: t.name || sc,
        preview: t.body,
        badge: "Template",
        apply: (before) => {
          setText(before + renderTemplate(t.body, contextVars));
          registerUsage.mutate(t);
        },
      });
    }
    for (const q of quickReplies) {
      const sc = q.shortcut?.toLowerCase();
      if (!sc || !sc.startsWith(slashQuery) || seen.has(sc)) continue;
      seen.add(sc);
      out.push({
        key: `q:${q.id}`,
        shortcut: sc,
        title: q.title || sc,
        preview: q.body,
        badge: "Quick reply",
        apply: (before) => {
          setText(before + q.body);
          void fnBumpQuickReplyUsage({ data: { id: q.id } }).catch(() => {
            /* usage count is a nice-to-have, never block the insert on it */
          });
        },
      });
    }
    return out.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slashQuery, templates, quickReplies, contextVars]);

  const slashOpen =
    slashKey !== null && slashKey !== slashDismissedKey && slashSuggestions.length > 0;

  // Keep the highlighted row in range as the candidate list changes while typing.
  useEffect(() => {
    if (slashActiveIndex >= slashSuggestions.length) setSlashActiveIndex(0);
  }, [slashSuggestions.length, slashActiveIndex]);

  const pickSlashSuggestion = useCallback(
    (s: SlashSuggestion) => {
      if (!slashMatch) return;
      const before = text.slice(0, slashMatch.index! + slashMatch[1].length);
      s.apply(before);
      setSlashDismissedKey(null);
      textareaRef.current?.focus();
    },
    [slashMatch, text],
  );

  /* -------------------------------- Submit -------------------------------- */

  const submit = async () => {
    if (!canReply) return;
    const body = text.trim();
    if (!body && !pendingAttachment) return;

    if (pendingAttachment) {
      setUploading(true);
      try {
        const { file, messageType } = pendingAttachment;
        const { url, size, type, path } = await uploadAttachment(
          workspaceId,
          conversationId,
          file,
          file.name,
        );
        await send.mutateAsync({
          conversationId,
          body: messageType === "document" ? file.name : body || undefined,
          messageType,
          mediaUrl: url,
          mediaType: type || file.type || null,
          mediaSize: size,
          replyToId: replyTo?.id ?? null,
          metadata: { media_path: path, media_name: file.name },
        });
        setText("");
        setPendingAttachment(null);
        void broadcastTyping.stop();
        onClearReply();
        saveDraft.mutate({ conversation_id: conversationId, body: "" });
      } catch (e) {
        toast.error("Could not send attachment", {
          description: String((e as Error).message),
        });
      } finally {
        setUploading(false);
        resetFileInputs();
      }
      return;
    }

    setText("");
    void broadcastTyping.stop();
    onClearReply();
    try {
      await send.mutateAsync({
        conversationId,
        body,
        messageType: "text",
        replyToId: replyTo?.id ?? null,
      });
      // Clear draft after send
      saveDraft.mutate({ conversation_id: conversationId, body: "" });
    } catch (e) {
      toast.error("Could not send", { description: String((e as Error).message) });
    }
  };

  /* --------------------------- Keyboard shortcuts ------------------------- */

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = e.metaKey || e.ctrlKey;

    // "/" suggestion dropdown is open — it owns navigation and selection keys
    // until the user picks a row, dismisses it, or the query stops matching.
    if (slashOpen && !meta) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashActiveIndex((i) => (i + 1) % slashSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashActiveIndex((i) => (i - 1 + slashSuggestions.length) % slashSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickSlashSuggestion(slashSuggestions[slashActiveIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissedKey(slashKey);
        return;
      }
    }

    // Cmd/Ctrl + B / I / E / Shift+X → formatting, as in any editor.
    if (meta && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        wrapWith("*");
        return;
      }
      if (key === "i") {
        e.preventDefault();
        wrapWith("_");
        return;
      }
      if (key === "e") {
        e.preventDefault();
        wrapWith("`");
        return;
      }
      if (e.shiftKey && key === "x") {
        e.preventDefault();
        wrapWith("~");
        return;
      }
    }

    // Cmd/Ctrl + K → open template picker. Composer owns this shortcut while
    // the textarea is focused: stopPropagation keeps it from also reaching the
    // inbox's advanced-search listener and the app-wide command palette, both
    // of which listen on `window` and would otherwise open at the same time.
    if (meta && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      e.stopPropagation();
      setPickerSeed("");
      setPickerOpen(true);
      return;
    }
    // Cmd/Ctrl + Shift + S → schedule
    if (meta && e.shiftKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (text.trim() || pendingAttachment) setScheduleOpen(true);
      return;
    }
    // Cmd/Ctrl + / → help
    if (meta && e.key === "/") {
      e.preventDefault();
      setHelpOpen(true);
      return;
    }
    // Escape → clear reply
    if (e.key === "Escape" && pendingAttachment) {
      e.preventDefault();
      setPendingAttachment(null);
      return;
    }
    if (e.key === "Escape" && replyTo) {
      e.preventDefault();
      onClearReply();
      return;
    }
    // Space or Enter — try to expand /shortcut
    if (e.key === " " || (e.key === "Enter" && !e.shiftKey)) {
      if (tryExpandShortcut()) {
        e.preventDefault();
        return;
      }
    }
    // Enter (no shift) → send. Shift+Enter → newline. Cmd/Ctrl+Enter → send.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  // Watch text for the slash marker to open picker as user types "/"
  useEffect(() => {
    const m = text.match(/(^|\s)\/([a-z0-9_-]{0,32})$/i);
    if (m && m[2].length === 0) {
      // User just typed a bare "/" — show hint via inline suggestion; opening dialog is aggressive.
      // Only auto-open on explicit shortcut command via Cmd+K. So do nothing here.
    }
  }, [text]);

  /* -------------------------------- Uploads ------------------------------- */

  const handleUpload = async (
    filesOrFile: FileList | File | null,
    kind: "image" | "video" | "audio" | "document" | "sticker",
  ) => {
    let file: File | null = null;
    if (filesOrFile instanceof File) file = filesOrFile;
    else if (filesOrFile && filesOrFile.length > 0) file = filesOrFile[0];
    if (!file) return;

    // Validate against the channel before uploading anything.
    let sendKind: "image" | "video" | "audio" | "document" | "sticker" = kind;
    if (channel) {
      if (kind === "sticker") {
        let animated = false;
        try {
          animated = isAnimatedWebp(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
        } catch {
          /* best-effort; fall back to the static limit */
        }

        if (file.type.toLowerCase().split(";")[0] !== "image/webp") {
          toast.error("Can't attach this sticker", {
            description: "WhatsApp stickers must be WebP files.",
          });
          resetFileInputs();
          return;
        }

        if (channel === "whatsapp") {
          try {
            if (animated) {
              const image = await loadStickerImage(file);
              if (
                image.naturalWidth !== WHATSAPP_STICKER_EDGE ||
                image.naturalHeight !== WHATSAPP_STICKER_EDGE
              ) {
                throw new Error("Animated WhatsApp stickers must be exactly 512x512 pixels.");
              }
            } else {
              const original = file;
              file = await normalizeWhatsAppSticker(file);
              if (file !== original) {
                toast.info("Sticker prepared for WhatsApp", {
                  description: "Resized to 512x512 WebP and kept within the 100 KB limit.",
                });
              }
            }
          } catch (error) {
            toast.error("Can't prepare this sticker", {
              description: error instanceof Error ? error.message : "The sticker is invalid.",
            });
            resetFileInputs();
            return;
          }
        }

        const check = checkAttachment(channel, { mime: file.type, size: file.size }, "sticker", {
          animated,
        });
        if (!check.ok) {
          toast.error("Can't attach this sticker", { description: check.reason });
          resetFileInputs();
          return;
        }
      } else {
        const check = checkAttachment(channel, { mime: file.type, size: file.size });
        if (!check.ok) {
          toast.error("Can't attach this file", { description: check.reason });
          resetFileInputs();
          return;
        }
        sendKind = check.kind;
        if (check.downgraded) {
          toast.info(
            `${channelLabel(channel)} doesn't support this ${kind} format; sending it as a file.`,
          );
        }
      }
    }

    const messageType = channel
      ? sendKind
      : kind === "image" && file.type.startsWith("image/")
        ? "image"
        : kind === "video" || file.type.startsWith("video/")
          ? "video"
          : kind === "audio" || file.type.startsWith("audio/")
            ? "audio"
            : kind === "sticker"
              ? "sticker"
              : "document";
    const canPreview = ["image", "video", "audio", "sticker"].includes(messageType);
    setPendingAttachment({
      file,
      messageType,
      previewUrl: canPreview ? URL.createObjectURL(file) : null,
    });
    resetFileInputs();
  };

  function resetFileInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (audioInputRef.current) audioInputRef.current.value = "";
    if (stickerInputRef.current) stickerInputRef.current.value = "";
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const kind = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "document";
    void handleUpload(file, kind);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const file = e.clipboardData.files?.[0];
    if (file) {
      e.preventDefault();
      const kind = file.type.startsWith("image/") ? "image" : "document";
      void handleUpload(file, kind);
    }
  };

  /* ------------------------------- Recording ------------------------------ */

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // WhatsApp accepts ogg/opus but not webm — prefer ogg where the browser
      // can produce it so voice notes play inline for the recipient.
      const preferred = ["audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"].find(
        (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m),
      );
      const rec = preferred
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      const recMime = (rec.mimeType || preferred || "audio/webm").split(";")[0]!;
      const ext = recMime.includes("ogg") ? "ogg" : recMime.includes("mp4") ? "m4a" : "webm";
      const fileName = `voice-note.${ext}`;
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recMime });
        if (channel) {
          const check = checkAttachment(channel, { mime: recMime, size: blob.size });
          if (!check.ok || check.kind !== "audio") {
            toast.error("Voice note not supported here", {
              description: check.ok
                ? `${channelLabel(channel)} can't play ${recMime} voice notes from this browser.`
                : check.reason,
            });
            return;
          }
        }
        const file = new File([blob], fileName, { type: recMime });
        setPendingAttachment({
          file,
          messageType: "audio",
          previewUrl: URL.createObjectURL(file),
        });
      };

      rec.start();
      mediaRecorderRef.current = rec;
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  /* ------------------------------- Actions -------------------------------- */

  const shareLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const meta: MessageMetadata = {
          location: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            label: "Current location",
          },
        };
        await send.mutateAsync({
          conversationId,
          messageType: "location",
          metadata: meta,
          replyToId: replyTo?.id ?? null,
        });
        onClearReply();
      },
      () => toast.error("Could not get location"),
    );
  };

  /* --------------------------------- Poll ---------------------------------- */

  const openPollDialog = () => {
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollOpen(true);
  };

  const submitPoll = async () => {
    const validated = validatePoll({ question: pollQuestion, options: pollOptions });
    if (!validated.ok) {
      toast.error("Can't send this poll", { description: validated.reason });
      return;
    }
    setPollSubmitting(true);
    try {
      await send.mutateAsync({
        conversationId,
        body: validated.data.question,
        messageType: "poll",
        metadata: { poll: validated.data },
        replyToId: replyTo?.id ?? null,
      });
      onClearReply();
      setPollOpen(false);
    } catch (e) {
      toast.error("Could not send poll", { description: String((e as Error).message) });
    } finally {
      setPollSubmitting(false);
    }
  };

  /* --------------------------------- Event --------------------------------- */

  const openEventDialog = () => {
    setEventForm({ title: "", start: "", end: "", location: "", description: "" });
    setEventOpen(true);
  };

  const submitEvent = async () => {
    const title = eventForm.title.trim();
    if (!title) {
      toast.error("Event title is required");
      return;
    }
    if (!eventForm.start) {
      toast.error("Event start date/time is required");
      return;
    }
    const start = new Date(eventForm.start);
    const end = eventForm.end ? new Date(eventForm.end) : undefined;
    if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
      toast.error("Invalid date/time");
      return;
    }
    if (end && end.getTime() <= start.getTime()) {
      toast.error("Event end must be after the start");
      return;
    }
    setEventSubmitting(true);
    try {
      const ics = buildEventIcs({
        title,
        start,
        end,
        location: eventForm.location.trim() || undefined,
        description: eventForm.description.trim() || undefined,
      });
      const fileName = icsFileName(title);
      const file = new File([ics], fileName, { type: "text/calendar" });
      if (channel) {
        const check = checkAttachment(channel, { mime: file.type, size: file.size });
        if (!check.ok) {
          toast.error("Can't attach this event", { description: check.reason });
          return;
        }
      }
      const { url, size, type, path } = await uploadAttachment(
        workspaceId,
        conversationId,
        file,
        fileName,
      );
      await send.mutateAsync({
        conversationId,
        body: fileName,
        messageType: "document",
        mediaUrl: url,
        mediaType: type || "text/calendar",
        mediaSize: size,
        replyToId: replyTo?.id ?? null,
        metadata: {
          media_path: path,
          media_name: fileName,
          event: {
            title,
            start: start.toISOString(),
            end: end?.toISOString(),
            location: eventForm.location.trim() || undefined,
            description: eventForm.description.trim() || undefined,
          },
        },
      });
      onClearReply();
      setEventOpen(false);
    } catch (e) {
      toast.error("Could not send event", { description: String((e as Error).message) });
    } finally {
      setEventSubmitting(false);
    }
  };

  const prefillCandidates = (contactPrefill ?? []).filter(
    (c): c is NonNullable<typeof c> => !!(c && (c.name || c.phone || c.email)),
  );

  const normalizePhoneInput = (raw: string | null | undefined): string => {
    if (!raw) return "";
    const trimmed = String(raw).trim();
    if (!trimmed) return "";
    return normalizePhone(trimmed) ?? trimmed;
  };

  const applyPrefill = (idx: number) => {
    const c = prefillCandidates[idx];
    if (!c) return;
    setPrefillIdx(idx);
    setContactForm({
      name: c.name ?? "",
      phone: normalizePhoneInput(c.phone),
      email: c.email ?? "",
    });
    // If this candidate references an existing CRM contact, auto-link to it
    // so the user sees exactly which record will be reused.
    setLinkedContactId(c.existingContactId ?? null);
    setDupeDismissed(false);
  };

  const contactDraftKey = `wacrm:contact-draft:${conversationId}`;

  const readContactDraft = (): {
    name: string;
    phone: string;
    email: string;
    linkedContactId?: string | null;
  } | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(contactDraftKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const name = typeof parsed.name === "string" ? parsed.name : "";
      const phone = typeof parsed.phone === "string" ? parsed.phone : "";
      const email = typeof parsed.email === "string" ? parsed.email : "";
      if (!name && !phone && !email) return null;
      return {
        name,
        phone,
        email,
        linkedContactId: typeof parsed.linkedContactId === "string" ? parsed.linkedContactId : null,
      };
    } catch {
      return null;
    }
  };

  const clearContactDraft = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(contactDraftKey);
    } catch {
      /* ignore */
    }
  };

  const shareContact = () => {
    const draft = readContactDraft();
    if (draft) {
      setPrefillIdx(-1);
      setContactForm({
        name: draft.name,
        phone: draft.phone,
        email: draft.email,
      });
      setLinkedContactId(draft.linkedContactId ?? null);
      setDupeDismissed(false);
      setContactOpen(true);
      return;
    }
    const idx = prefillCandidates.length > 0 ? 0 : -1;
    const best = prefillCandidates[0];
    setPrefillIdx(idx);
    setContactForm({
      name: best?.name ?? "",
      phone: normalizePhoneInput(best?.phone),
      email: best?.email ?? "",
    });
    setLinkedContactId(null);
    setDupeDismissed(false);
    setContactOpen(true);
  };

  // Persist draft while modal is open so closing/reopening keeps values.
  useEffect(() => {
    if (!contactOpen) return;
    if (typeof window === "undefined") return;
    const { name, phone, email } = contactForm;
    if (!name && !phone && !email) {
      clearContactDraft();
      return;
    }
    try {
      window.localStorage.setItem(
        contactDraftKey,
        JSON.stringify({ name, phone, email, linkedContactId }),
      );
    } catch {
      /* quota / disabled — ignore */
    }
    // contactDraftKey/clearContactDraft are derived from conversationId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactOpen, contactForm, linkedContactId, conversationId]);

  // Debounce dupe query from phone/email
  useEffect(() => {
    if (!contactOpen) return;
    const phone = contactForm.phone.trim();
    const email = contactForm.email.trim();
    const key = email || phone;
    const t = setTimeout(() => setDupeQuery(key), 300);
    return () => clearTimeout(t);
  }, [contactForm.phone, contactForm.email, contactOpen]);

  // Reset debounced query + dismissed flag when the modal closes
  useEffect(() => {
    if (!contactOpen) {
      setDupeQuery("");
      setDupeDismissed(false);
      setLinkedContactId(null);
      setPrefillIdx(-1);
    }
  }, [contactOpen]);

  const dupeSearchEnabled = contactOpen && dupeQuery.length >= 3;
  const dupeSearch = useContactSearch(workspaceId, dupeQuery, dupeSearchEnabled);

  const dupeMatches: ContactSearchResult[] = (() => {
    if (!dupeSearchEnabled || !dupeSearch.data) return [];
    const phoneDigits = digitsOnly(contactForm.phone);
    const emailLower = contactForm.email.trim().toLowerCase();
    return dupeSearch.data
      .filter((c) => {
        if (c.id === linkedContactId) return false;
        if (emailLower && c.email && c.email.toLowerCase() === emailLower) return true;
        if (phoneDigits && phoneDigits.length >= 6) {
          const cp = digitsOnly(c.phone ?? "");
          const cw = digitsOnly(c.whatsapp ?? "");
          if (cp && (cp.endsWith(phoneDigits) || phoneDigits.endsWith(cp))) return true;
          if (cw && (cw.endsWith(phoneDigits) || phoneDigits.endsWith(cw))) return true;
        }
        return false;
      })
      .slice(0, 3);
  })();

  const useExistingContact = (c: ContactSearchResult) => {
    const displayName =
      c.display_name ||
      c.name ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      "";
    setContactForm({
      name: displayName || contactForm.name,
      phone: c.phone || c.whatsapp || contactForm.phone,
      email: c.email || contactForm.email,
    });
    setLinkedContactId(c.id);
    setDupeDismissed(true);
  };

  const submitContact = async () => {
    const name = contactForm.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const phone = contactForm.phone.trim() || undefined;
    const email = contactForm.email.trim() || undefined;
    setContactSubmitting(true);
    try {
      // Persist a new contact to the workspace when not linked to an existing one.
      let contactId = linkedContactId;
      if (!contactId) {
        try {
          const [first_name, ...rest] = name.split(/\s+/);
          const last_name = rest.join(" ").trim() || null;
          const created = await createContact.mutateAsync({
            first_name: first_name || null,
            last_name,
            display_name: name,
            phone: phone ?? null,
            email: email ?? null,
          });
          contactId = created.id;
        } catch (persistErr) {
          // Non-fatal: still send the card even if persistence fails.
          console.warn("Failed to persist shared contact", persistErr);
        }
      }

      await send.mutateAsync({
        conversationId,
        messageType: "contact",
        body: name,
        metadata: {
          contact_card: { name, phone, email },
          ...(contactId ? { existing_contact_id: contactId } : {}),
        },
        replyToId: replyTo?.id ?? null,
      });
      onClearReply();
      clearContactDraft();
      setContactOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to share contact");
    } finally {
      setContactSubmitting(false);
    }
  };

  /* ---------------------------------- UI ---------------------------------- */

  // Only the "nothing matched yet" fallback hint — the dropdown (slashOpen)
  // takes over as soon as there is at least one matching shortcut.
  const showSlashHint = slashKey !== null && !slashOpen;
  const favorites = templates.filter((t) => t.is_favorite).slice(0, 5);

  if (!canReply) {
    return (
      <div className="border-t border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            You have read-only access to this inbox. Ask an admin for the &ldquo;Reply to
            conversations&rdquo; permission to send messages.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-t border-border bg-surface relative",
        dragOver && "ring-2 ring-primary ring-inset",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-20 bg-primary/5 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="rounded-control border-2 border-dashed border-primary bg-background/90 px-6 py-4 text-center">
            <Paperclip className="h-6 w-6 mx-auto mb-1 text-primary" />
            <p className="text-sm font-medium">Drop to upload</p>
          </div>
        </div>
      )}

      {/* Reply-to preview */}
      {replyTo && (
        <div className="px-4 pt-2 flex items-start gap-2">
          <div className="flex-1 rounded-control border-l-2 border-primary bg-muted px-3 py-2 min-w-0">
            <div className="text-[11px] font-medium text-primary flex items-center gap-1">
              <ReplyIcon className="h-3 w-3" />
              Replying to {replyTo.direction === "outbound" ? "yourself" : "contact"}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {replyTo.body ?? replyTo.message_type}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClearReply} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Attachment review — files are uploaded and delivered only after Send. */}
      {pendingAttachment && (
        <div className="px-4 pt-2">
          <div className="flex items-start gap-3 rounded-control border border-border bg-muted/40 p-3 shadow-sm">
            {pendingAttachment.previewUrl &&
            (pendingAttachment.messageType === "image" ||
              pendingAttachment.messageType === "sticker") ? (
              <img
                src={pendingAttachment.previewUrl}
                alt="Attachment preview"
                className="h-16 w-16 shrink-0 rounded-control object-cover"
              />
            ) : pendingAttachment.previewUrl && pendingAttachment.messageType === "video" ? (
              <video
                src={pendingAttachment.previewUrl}
                className="h-16 w-24 shrink-0 rounded-control bg-black object-cover"
                muted
              />
            ) : pendingAttachment.previewUrl && pendingAttachment.messageType === "audio" ? (
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Music className="h-5 w-5" />
              </div>
            ) : (
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
              <div>
                <div className="truncate text-sm font-medium">{pendingAttachment.file.name}</div>
                <div className="mt-0.5 text-xs capitalize text-muted-foreground">
                  {pendingAttachment.messageType} ·{" "}
                  {pendingAttachment.file.size < 1024 * 1024
                    ? `${Math.max(1, Math.round(pendingAttachment.file.size / 1024))} KB`
                    : `${(pendingAttachment.file.size / 1024 / 1024).toFixed(1)} MB`}
                </div>
              </div>
              {pendingAttachment.messageType === "audio" && pendingAttachment.previewUrl && (
                <audio
                  controls
                  preload="metadata"
                  src={pendingAttachment.previewUrl}
                  className="h-8 w-full"
                />
              )}
              <div className="text-[11px] text-muted-foreground">
                Review the attachment, then press Send.
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setPendingAttachment(null)}
              disabled={uploading}
              aria-label="Remove attachment"
              title="Remove attachment"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Status ribbon: draft + scheduled */}
      {(draft?.body || scheduledPending.length > 0) && (
        <div className="px-4 pt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          {draft?.body && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Draft auto-saved
            </span>
          )}
          {scheduledPending.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() => setScheduleOpen(true)}
            >
              <CalendarClock className="h-3 w-3" />
              {scheduledPending.length} scheduled
            </button>
          )}
        </div>
      )}

      {/* Quick favorites strip */}
      {favorites.length > 0 && (
        <div className="px-3 pt-2 flex items-center gap-1 overflow-x-auto no-scrollbar">
          <Zap className="h-3 w-3 text-muted-foreground shrink-0" />
          {favorites.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(renderTemplate(t.body, contextVars), t)}
              className="text-[11px] px-2 py-0.5 rounded-control border border-border bg-background hover:bg-muted whitespace-nowrap transition-colors"
              title={t.body}
            >
              {t.name}
            </button>
          ))}
          <TemplateManager
            trigger={
              <button
                type="button"
                className="text-[11px] px-2 py-0.5 rounded-control border border-dashed border-border text-muted-foreground hover:bg-muted whitespace-nowrap"
              >
                Manage
              </button>
            }
          />
        </div>
      )}

      {/* "/" suggestion dropdown — matching templates and quick replies */}
      {slashOpen && (
        <div
          role="listbox"
          aria-label="Shortcut suggestions"
          className="mx-4 mt-2 rounded-control border border-border bg-popover shadow-md overflow-hidden"
        >
          {slashSuggestions.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="option"
              aria-selected={i === slashActiveIndex}
              onMouseEnter={() => setSlashActiveIndex(i)}
              onClick={() => pickSlashSuggestion(s)}
              className={cn(
                "w-full flex items-start gap-2 px-3 py-2 text-left text-sm border-b border-border last:border-b-0",
                i === slashActiveIndex ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <span className="shrink-0 mt-0.5 text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                /{s.shortcut}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium truncate">{s.title}</span>
                <span className="block text-xs text-muted-foreground truncate">{s.preview}</span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground mt-0.5">{s.badge}</span>
            </button>
          ))}
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border bg-muted/40">
            <kbd className="px-1 rounded bg-background font-mono">↑↓</kbd> to navigate ·{" "}
            <kbd className="px-1 rounded bg-background font-mono">Enter</kbd> to pick ·{" "}
            <kbd className="px-1 rounded bg-background font-mono">Esc</kbd> to dismiss
          </div>
        </div>
      )}

      {/* Slash hint — shown when "/" is typed but nothing matches yet */}
      {showSlashHint && (
        <div className="px-4 pt-2 text-[11px] text-muted-foreground flex items-center gap-1">
          <CommandIcon className="h-3 w-3" />
          Type a shortcut name, or press{" "}
          <kbd className="px-1 rounded bg-muted font-mono">{mod}+K</kbd> to browse
        </div>
      )}

      <div className="p-2 sm:p-3">
        <input
          ref={imageInputRef}
          type="file"
          accept={channel ? acceptFor(channel, ["image", "video"]) : "image/*,video/*"}
          className="hidden"
          onChange={(e) =>
            handleUpload(
              e.target.files,
              e.target.files?.[0]?.type.startsWith("video/") ? "video" : "image",
            )
          }
        />
        <input
          ref={audioInputRef}
          type="file"
          accept={channel ? acceptFor(channel, ["audio"]) : "audio/*"}
          className="hidden"
          onChange={(e) => handleUpload(e.target.files, "audio")}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={channel ? acceptFor(channel, ["document"]) || undefined : undefined}
          className="hidden"
          onChange={(e) => handleUpload(e.target.files, "document")}
        />
        <input
          ref={stickerInputRef}
          type="file"
          accept={channel ? acceptFor(channel, ["sticker"]) || "image/webp" : "image/webp"}
          className="hidden"
          onChange={(e) => handleUpload(e.target.files, "sticker")}
        />

        {/*
          The whole composer — formatting toolbar, textarea, and the
          attach/emoji/more/voice/send row — lives inside one bordered field
          now, instead of the textarea having its own border with the attach
          and send clusters floating beside it as separate controls.
        */}
        <div
          className={cn(
            "flex flex-col rounded-control border border-input bg-background transition-shadow",
            "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
          )}
        >
          <FormattingToolbar
            visible={composerFocused || !!text.trim()}
            disabled={disabled || isRecording || uploading}
            showPreview={showPreview}
            canPreview={hasFormatting(text)}
            onTogglePreview={() => setShowPreview((v) => !v)}
            onWrap={wrapWith}
            onCodeBlock={() => applyFormat(wrapCodeBlock)}
            onQuote={() => applyFormat((v, a, b) => togglePrefix(v, a, b, "> "))}
            onBullet={() => applyFormat((v, a, b) => togglePrefix(v, a, b, "- "))}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              if (next.trim()) void broadcastTyping();
              else void broadcastTyping.stop();
            }}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => {
              setComposerFocused(false);
              void broadcastTyping.stop();
            }}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            placeholder={
              isRecording
                ? "Recording"
                : pendingAttachment
                  ? "Add a caption (optional)"
                  : `Type a message. Type / for shortcuts, ${mod}+K for templates.`
            }
            rows={1}
            disabled={disabled || isRecording || uploading}
            className={cn(
              "block w-full resize-none border-0 bg-transparent px-3 py-3 text-base",
              "min-h-11 sm:min-h-10 max-h-52 placeholder:text-muted-foreground",
              "focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            )}
          />

          {/* Bottom action row — attach/emoji/more on the left, voice/send on
              the right — inside the same field. */}
          {draftUrl && !pendingAttachment && (
            <a
              href={draftUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mx-2 mb-2 flex min-w-0 items-center gap-2 rounded-control border border-border bg-muted/50 px-3 py-2 text-xs hover:bg-muted"
              aria-label={`Open link preview for ${new URL(draftUrl).hostname}`}
            >
              <Globe2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{new URL(draftUrl).hostname}</span>
                <span className="block truncate text-muted-foreground">{draftUrl}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">Link preview</span>
            </a>
          )}
          <div className="flex items-center justify-between gap-1 border-t border-border px-1.5 py-1">
            <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-full"
                    disabled={disabled || uploading}
                    aria-label="Attach"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {(allow("image") || allow("video")) && (
                    <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                      <ImageIcon className="h-4 w-4" />{" "}
                      {allow("image") && allow("video")
                        ? "Photo / Video"
                        : allow("image")
                          ? "Photo"
                          : "Video"}
                    </DropdownMenuItem>
                  )}
                  {allow("audio") && (
                    <DropdownMenuItem onClick={() => audioInputRef.current?.click()}>
                      <Music className="h-4 w-4" /> Audio
                    </DropdownMenuItem>
                  )}
                  {allow("document") && (
                    <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                      <FileText className="h-4 w-4" /> Document
                    </DropdownMenuItem>
                  )}
                  {allow("location") && (
                    <DropdownMenuItem onClick={shareLocation}>
                      <MapPin className="h-4 w-4" /> Location
                    </DropdownMenuItem>
                  )}
                  {allow("contact") && (
                    <DropdownMenuItem onClick={shareContact}>
                      <UserIcon className="h-4 w-4" /> Contact
                    </DropdownMenuItem>
                  )}
                  {allow("product") && (
                    <DropdownMenuItem onClick={() => setProductPickerOpen(true)}>
                      <ShoppingBag className="h-4 w-4" />{" "}
                      {channel === "whatsapp" ? "Catalog product" : "Product"}
                    </DropdownMenuItem>
                  )}
                  {allow("sticker") && (
                    <DropdownMenuItem onClick={() => stickerInputRef.current?.click()}>
                      <StickerIcon className="h-4 w-4" /> Sticker
                    </DropdownMenuItem>
                  )}
                  {allow("poll") && (
                    <DropdownMenuItem onClick={openPollDialog}>
                      <ListChecks className="h-4 w-4" /> Poll
                    </DropdownMenuItem>
                  )}
                  {allow("event") && (
                    <DropdownMenuItem onClick={openEventDialog}>
                      <CalendarPlus className="h-4 w-4" /> Event
                    </DropdownMenuItem>
                  )}
                  {!allow("image") &&
                    !allow("video") &&
                    !allow("audio") &&
                    !allow("document") &&
                    !allow("location") &&
                    !allow("contact") &&
                    !allow("product") &&
                    !allow("sticker") &&
                    !allow("poll") &&
                    !allow("event") && (
                      <DropdownMenuItem disabled>
                        {channelLabel(channel)} supports text only
                      </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-full"
                    disabled={disabled}
                    aria-label="Emoji"
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto" align="start">
                  <EmojiPicker
                    onSelect={(e) => {
                      setText((t) => t + e);
                      textareaRef.current?.focus();
                    }}
                  />
                </PopoverContent>
              </Popover>

              {/* Overflow: secondary actions that don't fit the toolbar */}
              <Popover open={moreActionsOpen} onOpenChange={setMoreActionsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-full"
                    disabled={disabled}
                    aria-label="More actions"
                    title="More actions"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1" align="start">
                  <div className="flex flex-col gap-0.5">
                    {can("templates") && (
                      <Button
                        variant="ghost"
                        className="justify-start gap-2 h-8 px-2 font-normal"
                        disabled={disabled}
                        onClick={() => {
                          setMoreActionsOpen(false);
                          setPickerSeed("");
                          setPickerOpen(true);
                        }}
                      >
                        <BookOpen className="h-4 w-4" /> Templates
                        <span className="ml-auto text-[11px] text-muted-foreground">{mod}+K</span>
                      </Button>
                    )}
                    {channel === "whatsapp" && (
                      <Button
                        variant="ghost"
                        className="justify-start gap-2 h-8 px-2 font-normal"
                        disabled={disabled}
                        onClick={() => {
                          setMoreActionsOpen(false);
                          setFormPickerOpen(true);
                        }}
                      >
                        <ClipboardList className="h-4 w-4" /> Send WhatsApp form
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="justify-start gap-2 h-8 px-2 font-normal"
                      disabled={disabled}
                      onClick={() => {
                        setMoreActionsOpen(false);
                        setQuickReplyDraftToSave(undefined);
                        setQuickReplyPickerOpen(true);
                      }}
                    >
                      <MessageSquareText className="h-4 w-4" /> Quick replies
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start gap-2 h-8 px-2 font-normal"
                      disabled={disabled}
                      onClick={() => {
                        setMoreActionsOpen(false);
                        setProjectUpdatePickerOpen(true);
                      }}
                    >
                      <FolderKanban className="h-4 w-4" /> Share project update
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start gap-2 h-8 px-2 font-normal"
                      disabled={disabled || !text.trim()}
                      onClick={() => {
                        setMoreActionsOpen(false);
                        setQuickReplyDraftToSave(text.trim());
                        setQuickReplyPickerOpen(true);
                      }}
                    >
                      <Save className="h-4 w-4" /> Save as quick reply
                    </Button>
                    <AIReplyAssistant
                      triggerLabel="AI reply assistant"
                      conversationId={conversationId}
                      draft={text}
                      onApply={(t) => {
                        setText(t);
                        setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                      disabled={disabled}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Send / Record — always rightmost */}
            <div className="shrink-0">
              {text.trim() || pendingAttachment || uploading ? (
                <div className="flex items-center">
                  <Button
                    type="button"
                    size="icon"
                    className="h-8 w-8 rounded-full rounded-r-none"
                    onClick={submit}
                    disabled={disabled || uploading || (!text.trim() && !pendingAttachment)}
                    aria-label="Send"
                    title={`Send (${IS_MAC ? "↵ or ⌘↵" : "↵ or Ctrl+↵"})`}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        className="h-8 w-8 rounded-full rounded-l-none border-l border-primary-foreground/20"
                        disabled={disabled || uploading || (!text.trim() && !pendingAttachment)}
                        aria-label="Send options"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel className="text-[11px]  text-muted-foreground">
                        Send
                      </DropdownMenuLabel>
                      <DropdownMenuItem onClick={submit}>
                        <Send className="h-3.5 w-3.5" />
                        Send now
                        <span className="ml-auto text-[11px] text-muted-foreground">↵</span>
                      </DropdownMenuItem>
                      {can("schedule") && (!!text.trim() || !!pendingAttachment) && (
                        <DropdownMenuItem onClick={() => setScheduleOpen(true)}>
                          <Clock className="h-3.5 w-3.5" />
                          Schedule
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            {mod}+⇧S
                          </span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                        <Keyboard className="h-3.5 w-3.5" />
                        Keyboard shortcuts
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : isRecording ? (
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8 rounded-full animate-pulse"
                  onClick={stopRecording}
                  aria-label="Stop recording"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : allow("voice_note") ? (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 rounded-full"
                  onClick={startRecording}
                  disabled={disabled}
                  aria-label="Record voice note"
                >
                  <Mic className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={submit}
                  disabled
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
        {showPreview && text.trim() && (
          <div className="mt-1.5 rounded-control border border-border/70 bg-muted/40 px-3 py-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Eye className="h-3 w-3" />
              Preview
            </div>
            <FormattedText text={text} className="text-sm" />
          </div>
        )}
      </div>

      {/* Overlays */}
      <TemplatePicker
        contact={crmContact ?? undefined}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(rendered, tpl) => applyTemplate(rendered, tpl)}
        onPickAndSend={(rendered, tpl, payload) => sendTemplateNow(rendered, tpl, payload)}
        contextVars={contextVars}
        initialSearch={pickerSeed}
      />
      <ProductPicker
        open={productPickerOpen}
        onOpenChange={setProductPickerOpen}
        workspaceId={workspaceId}
        conversationId={conversationId}
        channel={channel}
        replyToId={replyTo?.id ?? null}
        onSent={onClearReply}
      />
      {projectUpdatePickerOpen && (
        <ProjectUpdatePicker
          open={projectUpdatePickerOpen}
          onOpenChange={setProjectUpdatePickerOpen}
          workspaceId={workspaceId}
          onInsert={(message) => {
            setText((current) => (current.trim() ? `${current.trimEnd()}\n\n${message}` : message));
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
        />
      )}
      <QuickReplyPicker
        open={quickReplyPickerOpen}
        onOpenChange={setQuickReplyPickerOpen}
        workspaceId={workspaceId}
        onInsert={insertQuickReply}
        draftToSave={quickReplyDraftToSave}
      />
      <WhatsAppFormPicker
        conversationId={conversationId}
        open={formPickerOpen}
        onOpenChange={setFormPickerOpen}
      />
      <TemplateManager open={manageOpen} onOpenChange={setManageOpen} />
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        conversationId={conversationId}
        workspaceId={workspaceId}
        recipientPhone={crmContact?.phone || crmContact?.whatsapp || null}
        body={text.trim()}
        attachment={pendingAttachment}
        onScheduled={() => {
          setText("");
          setPendingAttachment(null);
          resetFileInputs();
        }}
      />
      <ShortcutHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <Dialog open={contactOpen} onOpenChange={(o) => !contactSubmitting && setContactOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share a contact</DialogTitle>
            <DialogDescription>Send a contact card in this conversation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(() => {
              const activeSource =
                prefillIdx >= 0 ? prefillCandidates[prefillIdx]?.source : undefined;
              if (!activeSource || linkedContactId) return null;
              const isAttachment = activeSource === "attachment";
              return (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Prefilled from</span>
                  <Badge variant="secondary" className="h-5 px-2 gap-1">
                    {isAttachment ? (
                      <Paperclip className="h-3 w-3" />
                    ) : (
                      <UserCheck className="h-3 w-3" />
                    )}
                    {isAttachment ? "Shared attachment" : "Current recipient"}
                  </Badge>
                </div>
              );
            })()}
            {prefillCandidates.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="contact-prefill">Prefill from</Label>
                <Select
                  value={prefillIdx >= 0 ? String(prefillIdx) : ""}
                  onValueChange={(v) => applyPrefill(Number(v))}
                >
                  <SelectTrigger id="contact-prefill">
                    <SelectValue placeholder="Choose a shared contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {prefillCandidates.map((c, i) => {
                      const label = c.name || c.phone || c.email || `Contact ${i + 1}`;
                      const sub = [c.phone, c.email].filter(Boolean).join(" · ");
                      const srcLabel = c.source === "recipient" ? "Recipient" : "Attachment";
                      return (
                        <SelectItem key={i} value={String(i)}>
                          <span className="flex items-center gap-2 truncate">
                            <Badge
                              variant="outline"
                              className="h-4 px-1.5 text-[11px] font-normal shrink-0"
                            >
                              {srcLabel}
                            </Badge>
                            <span className="truncate">
                              {label}
                              {sub && sub !== label && (
                                <span className="text-muted-foreground"> — {sub}</span>
                              )}
                            </span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                autoFocus
                value={contactForm.name}
                onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">
                Phone <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="contact-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={contactForm.phone}
                onChange={(e) => {
                  setContactForm((f) => ({ ...f, phone: e.target.value }));
                  setLinkedContactId(null);
                  setDupeDismissed(false);
                }}
                onBlur={(e) => {
                  const normalized = normalizePhoneInput(e.target.value);
                  if (normalized !== e.target.value) {
                    setContactForm((f) => ({ ...f, phone: normalized }));
                  }
                }}
                placeholder="+1 555 123 4567"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">
                Email <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="contact-email"
                type="email"
                value={contactForm.email}
                onChange={(e) => {
                  setContactForm((f) => ({ ...f, email: e.target.value }));
                  setLinkedContactId(null);
                  setDupeDismissed(false);
                }}
                placeholder="jane@example.com"
              />
            </div>
            {linkedContactId && (
              <div className="flex items-start gap-2 rounded-control border border-primary/30 bg-primary/5 p-2.5 text-xs">
                <UserCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground">Linked to existing contact</div>
                  <div className="text-muted-foreground truncate">
                    {contactForm.name || "Unnamed contact"}
                    {contactForm.phone ? ` · ${contactForm.phone}` : ""}
                  </div>
                  <div
                    className="mt-0.5 font-mono text-[11px] text-muted-foreground/80 truncate"
                    title={linkedContactId}
                  >
                    ID: {linkedContactId}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setLinkedContactId(null);
                    setDupeDismissed(false);
                  }}
                >
                  Unlink
                </Button>
              </div>
            )}
            {!linkedContactId && !dupeDismissed && dupeMatches.length > 0 && (
              <div className="rounded-control border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <UserCheck className="h-4 w-4 text-amber-600" />
                  {dupeMatches.length === 1
                    ? "A matching contact already exists"
                    : `${dupeMatches.length} matching contacts already exist`}
                </div>
                <div className="space-y-1.5">
                  {dupeMatches.map((c) => {
                    const label =
                      c.display_name ||
                      c.name ||
                      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
                      c.phone ||
                      c.email ||
                      "Contact";
                    const sub = [normalizePhone(c.phone) || c.phone, c.email]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 rounded-control bg-background px-2 py-1.5"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{label}</div>
                          {sub && (
                            <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-xs"
                          onClick={() => useExistingContact(c)}
                        >
                          Link
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDupeDismissed(true)}
                  >
                    Create new instead
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setContactOpen(false)}
              disabled={contactSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={submitContact}
              disabled={contactSubmitting || !contactForm.name.trim()}
            >
              {contactSubmitting ? "Sending" : "Share contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Poll (Telegram only) */}
      <Dialog open={pollOpen} onOpenChange={(o) => !pollSubmitting && setPollOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a poll</DialogTitle>
            <DialogDescription>Send a Telegram poll in this conversation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="poll-question">Question</Label>
              <Input
                id="poll-question"
                autoFocus
                value={pollQuestion}
                maxLength={300}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="What should we ask?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Options</Label>
              <div className="space-y-2">
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      maxLength={100}
                      onChange={(e) =>
                        setPollOptions((prev) =>
                          prev.map((o, i) => (i === idx ? e.target.value : o)),
                        )
                      }
                      placeholder={`Option ${idx + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={pollOptions.length <= POLL_MIN_OPTIONS}
                      onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove option"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={pollOptions.length >= POLL_MAX_OPTIONS}
                onClick={() => setPollOptions((prev) => [...prev, ""])}
              >
                <Plus className="h-3.5 w-3.5" /> Add option
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPollOpen(false)} disabled={pollSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitPoll} disabled={pollSubmitting || !pollQuestion.trim()}>
              {pollSubmitting ? "Sending" : "Send poll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event → sent as a real .ics calendar-invite document */}
      <Dialog open={eventOpen} onOpenChange={(o) => !eventSubmitting && setEventOpen(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Share an event</DialogTitle>
            <DialogDescription>
              Sends a calendar invite (.ics file) the recipient can add to their calendar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                autoFocus
                value={eventForm.title}
                onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Product demo"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Starts</Label>
                <SchedulePicker
                  value={eventForm.start}
                  onChange={(start) => setEventForm((f) => ({ ...f, start }))}
                  disabled={eventSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>
                    Ends <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  {eventForm.end && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setEventForm((f) => ({ ...f, end: "" }))}
                      disabled={eventSubmitting}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <SchedulePicker
                  value={eventForm.end}
                  onChange={(end) => setEventForm((f) => ({ ...f, end }))}
                  disabled={eventSubmitting}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-location">
                Location <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="event-location"
                value={eventForm.location}
                onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="123 Main St, or a video call link"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-description">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="event-description"
                value={eventForm.description}
                onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEventOpen(false)} disabled={eventSubmitting}>
              Cancel
            </Button>
            <Button onClick={submitEvent} disabled={eventSubmitting || !eventForm.title.trim()}>
              {eventSubmitting ? "Sending" : "Send event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Keyboard shortcuts                             */
/* -------------------------------------------------------------------------- */

function ShortcutHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span aria-hidden className="sr-only" />
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" side="top">
        <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Keyboard className="h-4 w-4" />
          Keyboard shortcuts
        </div>
        <ul className="space-y-1.5 text-xs">
          <ShortcutRow keys={["↵"]} label="Send message" />
          <ShortcutRow keys={["Shift", "↵"]} label="New line" />
          <ShortcutRow keys={[mod, "K"]} label="Open template picker" />
          <ShortcutRow keys={["/", "shortcut", "Space"]} label="Expand slash command" />
          <ShortcutRow keys={[mod, "⇧", "S"]} label="Schedule / send later" />
          <ShortcutRow keys={["Esc"]} label="Cancel reply" />
          <ShortcutRow keys={[mod, "/"]} label="Show this help" />
        </ul>
        <div className="mt-3 pt-2 border-t border-border text-[11px] text-muted-foreground">
          You can also drag &amp; drop or paste files directly into the composer.
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-0.5">
        {keys.map((k, i) => (
          <Badge key={i} variant="outline" className="h-4 px-1 text-[11px] font-mono">
            {k}
          </Badge>
        ))}
      </span>
    </li>
  );
}

/**
 * Formatting strip above the composer: a segmented pill that slides in with
 * the composer, so it stays out of the way until you're actually writing.
 * Every button types WhatsApp's own markers around the selection, which is
 * why the preview matches what the recipient's client renders.
 */
function FormattingToolbar({
  visible,
  disabled,
  showPreview,
  canPreview,
  onTogglePreview,
  onWrap,
  onCodeBlock,
  onQuote,
  onBullet,
}: {
  visible: boolean;
  disabled: boolean;
  showPreview: boolean;
  canPreview: boolean;
  onTogglePreview: () => void;
  onWrap: (marker: FormatMarker) => void;
  onCodeBlock: () => void;
  onQuote: () => void;
  onBullet: () => void;
}) {
  type FormatAction = {
    key: string;
    icon: typeof Bold;
    label: string;
    hint?: string;
    run: () => void;
  };

  const groups: FormatAction[][] = [
    [
      { key: "bold", icon: Bold, label: "Bold", hint: `${mod}+B`, run: () => onWrap("*") },
      { key: "italic", icon: Italic, label: "Italic", hint: `${mod}+I`, run: () => onWrap("_") },
      {
        key: "strike",
        icon: Strikethrough,
        label: "Strikethrough",
        hint: `${mod}+Shift+X`,
        run: () => onWrap("~"),
      },
    ],
    [
      { key: "mono", icon: Code, label: "Monospace", hint: `${mod}+E`, run: () => onWrap("`") },
      { key: "block", icon: Code2, label: "Code block", run: onCodeBlock },
    ],
    [
      { key: "quote", icon: Quote, label: "Quote", run: onQuote },
      { key: "list", icon: List, label: "Bulleted list", run: onBullet },
    ],
  ];

  // A header row inside the composer's own border, not a separate floating
  // pill — it collapses to zero height when hidden so the field reads as one
  // control either way.
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "flex items-center justify-between gap-2 overflow-hidden px-2 transition-all duration-150 ease-out",
        visible
          ? "max-h-10 border-b border-border py-1 opacity-100"
          : "pointer-events-none max-h-0 py-0 opacity-0",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-0.5">
        {groups.map((group, gi) => (
          <div key={gi} className="flex items-center">
            {gi > 0 && <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />}
            {group.map(({ key, icon: Icon, label, hint, run }) => (
              <button
                key={key}
                type="button"
                // Keep the textarea's selection — losing focus on mousedown
                // would collapse it before the click handler runs.
                onMouseDown={(e) => e.preventDefault()}
                onClick={run}
                disabled={disabled}
                tabIndex={visible ? 0 : -1}
                title={hint ? `${label}  ·  ${hint}` : label}
                aria-label={label}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-[3px] text-muted-foreground",
                  "transition-colors hover:bg-muted hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                  "disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        ))}
      </div>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onTogglePreview}
        disabled={disabled || !canPreview}
        tabIndex={visible ? 0 : -1}
        title="Preview formatting"
        aria-pressed={showPreview}
        className={cn(
          "flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-2",
          "text-[11px] font-medium text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
          "disabled:pointer-events-none disabled:opacity-40",
          showPreview && "bg-muted text-foreground",
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Preview</span>
      </button>
    </div>
  );
}
