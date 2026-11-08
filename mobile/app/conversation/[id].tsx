import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  type TextStyle,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { RichText } from "@/components/RichText";
import { stripFormatting, toggleWrap, type RichMarker } from "@/lib/rich-text";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuth } from "@/auth/AuthProvider";
import { useRealtimeTable } from "@/realtime/useRealtimeTable";
import { supabase } from "@/api/supabase";
import {
  addNote,
  fetchContact,
  fetchMessages,
  fetchNotes,
  fetchQuickReplies,
  markConversationRead,
  sendMessage,
  type MessageRow,
} from "@/api/inbox";
import { useTypingChannel } from "@/inbox/useTyping";
import { useMarkRead } from "@/inbox/useReadReceipts";
import { startRecording, stopRecording, cancelRecording, uploadVoiceNote } from "@/inbox/voice";
import { suggestReply } from "@/inbox/ai";

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id);
  const t = useTheme();
  const qc = useQueryClient();
  const { user } = useAuth();
  const listRef = useRef<FlatList<MessageRow>>(null);
  const inputRef = useRef<TextInput>(null);

  const [input, setInput] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // Only pushed onto the TextInput right after a toolbar action, then handed back to the OS.
  const [forcedSelection, setForcedSelection] = useState<
    { start: number; end: number } | undefined
  >(undefined);
  const [internal, setInternal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const msgs = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages(conversationId),
  });
  const contactQ = useQuery({
    queryKey: ["conversation-contact", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("contact_id, subject, channel, status, assignee_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (!data?.contact_id) return { conv: data, contact: null };
      const contact = await fetchContact(data.contact_id);
      return { conv: data, contact };
    },
  });
  const quickReplies = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => fetchQuickReplies(30),
  });
  const notes = useQuery({
    queryKey: ["notes", conversationId],
    queryFn: () => fetchNotes(conversationId),
  });

  useRealtimeTable(
    "messages",
    ["messages", conversationId],
    `conversation_id=eq.${conversationId}`,
  );
  useRealtimeTable(
    "conversation_notes",
    ["notes", conversationId],
    `conversation_id=eq.${conversationId}`,
  );

  const { typingUserIds, sendTyping } = useTypingChannel(conversationId, user?.id);
  useMarkRead(msgs.data?.map((m) => m.id) ?? [], user?.id);

  useEffect(() => {
    markConversationRead(conversationId).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [msgs.data?.length]);

  const send = useMutation({
    mutationFn: async (opts: {
      body: string;
      attachments?: {
        url: string;
        mime_type: string;
        name: string;
        duration_ms?: number;
        size_bytes?: number;
      }[];
    }) => {
      await sendMessage({
        conversation_id: conversationId,
        body: opts.body,
        is_internal: internal,
        attachments: opts.attachments,
      });
    },
    onSuccess: () => {
      setInput("");
      setSelection({ start: 0, end: 0 });
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: any) => Alert.alert("Send failed", e?.message ?? "Unknown error"),
  });

  async function attachImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const url = await uploadFile(a.uri, a.mimeType ?? "image/jpeg", conversationId);
    if (!url) return;
    send.mutate({
      body: input || "",
      attachments: [
        {
          url,
          mime_type: a.mimeType ?? "image/jpeg",
          name: a.fileName ?? "image",
          size_bytes: a.fileSize ?? 0,
        },
      ],
    });
  }

  async function attachDocument() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const url = await uploadFile(a.uri, a.mimeType ?? "application/octet-stream", conversationId);
    if (!url) return;
    send.mutate({
      body: input || a.name,
      attachments: [
        {
          url,
          mime_type: a.mimeType ?? "application/octet-stream",
          name: a.name,
          size_bytes: a.size ?? 0,
        },
      ],
    });
  }

  async function toggleRecord() {
    if (!recording) {
      try {
        await startRecording();
        setRecording(true);
      } catch (e: any) {
        Alert.alert("Cannot record", e?.message ?? "Microphone unavailable");
      }
      return;
    }
    const rec = await stopRecording();
    setRecording(false);
    if (!rec) return;
    try {
      const { url, size_bytes } = await uploadVoiceNote(rec.uri, conversationId);
      send.mutate({
        body: "",
        attachments: [
          {
            url,
            mime_type: "audio/mp4",
            name: "voice-note.m4a",
            duration_ms: rec.durationMs,
            size_bytes,
          },
        ],
      });
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Try again");
    }
  }

  async function runAiSuggest() {
    setAiLoading(true);
    try {
      const s = await suggestReply(conversationId);
      if (s) setInput((cur) => (cur ? `${cur} ${s}` : s));
    } catch (e: any) {
      Alert.alert("AI reply failed", e?.message ?? "Try again");
    } finally {
      setAiLoading(false);
    }
  }

  function applyFormat(marker: RichMarker) {
    const res = toggleWrap(input, selection.start, selection.end, marker);
    setInput(res.text);
    setSelection({ start: res.selectionStart, end: res.selectionEnd });
    setForcedSelection({ start: res.selectionStart, end: res.selectionEnd });
    inputRef.current?.focus();
  }

  return (
    <Screen>
      <Header
        title={
          contactQ.data?.contact?.display_name ?? contactQ.data?.conv?.subject ?? "Conversation"
        }
        subtitle={`${contactQ.data?.conv?.channel ?? ""} · ${contactQ.data?.conv?.status ?? ""}`}
        onBack={() => router.back()}
        onOpenSidebar={() => setSidebarOpen(true)}
      />

      <FlatList
        ref={listRef}
        data={msgs.data ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingVertical: t.spacing.md, gap: t.spacing.sm }}
        renderItem={({ item }) => <MessageBubble msg={item} />}
      />

      {typingUserIds.length ? (
        <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginLeft: 8 }}>Typing</Text>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingTop: t.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: t.colors.border,
          }}
        >
          <FormatBtn label="B" hint="Bold" marker="*" onPress={applyFormat} />
          <FormatBtn label="I" hint="Italic" marker="_" onPress={applyFormat} />
          <FormatBtn label="S" hint="Strikethrough" marker="~" onPress={applyFormat} />
          <FormatBtn label="{ }" hint="Monospace" marker="`" onPress={applyFormat} />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingTop: t.spacing.sm,
          }}
        >
          <Pressable onPress={() => setInternal((v) => !v)}>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: internal ? "#FDE68A" : t.colors.muted,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: internal ? "#78350F" : t.colors.mutedFg,
                }}
              >
                {internal ? "NOTE" : "REPLY"}
              </Text>
            </View>
          </Pressable>
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={(v) => {
              setInput(v);
              sendTyping();
            }}
            selection={forcedSelection}
            onSelectionChange={(e) => {
              setSelection(e.nativeEvent.selection);
              if (forcedSelection) setForcedSelection(undefined);
            }}
            placeholder={internal ? "Internal note (not sent to customer)" : "Type a reply"}
            placeholderTextColor={t.colors.mutedFg}
            multiline
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 120,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: t.radius.md,
              backgroundColor: t.colors.muted,
              color: t.colors.foreground,
            }}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <IconBtn label="⚡" onPress={() => setQuickOpen(true)} />
          <IconBtn label="📎" onPress={attachDocument} />
          <IconBtn label="🖼" onPress={attachImage} />
          <IconBtn
            label={recording ? "■" : "🎙"}
            onPress={toggleRecord}
            tone={recording ? "destructive" : "default"}
          />
          <IconBtn label={aiLoading ? "" : "AI"} onPress={runAiSuggest} />
          <View style={{ flex: 1 }} />
          <Button
            title={internal ? "Add note" : "Send"}
            onPress={async () => {
              if (!input.trim()) return;
              if (internal) {
                await addNote(conversationId, input.trim());
                setInput("");
                qc.invalidateQueries({ queryKey: ["notes", conversationId] });
              } else {
                send.mutate({ body: input.trim() });
              }
            }}
            disabled={!input.trim() && !internal}
            loading={send.isPending}
          />
        </View>
      </KeyboardAvoidingView>

      <QuickReplyPicker
        open={quickOpen}
        replies={quickReplies.data ?? []}
        onClose={() => setQuickOpen(false)}
        onPick={(body) => {
          setInput((cur) => (cur ? `${cur} ${body}` : body));
          setQuickOpen(false);
        }}
      />

      <CustomerSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        contact={contactQ.data?.contact}
        conversation={contactQ.data?.conv}
        notes={notes.data ?? []}
      />
    </Screen>
  );
}

function Header({
  title,
  subtitle,
  onBack,
  onOpenSidebar,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  onOpenSidebar: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingBottom: t.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: t.colors.border,
      }}
    >
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={{ fontSize: 20, color: t.colors.foreground }}>‹</Text>
      </Pressable>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text
          style={{ color: t.colors.foreground, fontSize: 16, fontWeight: "700" }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={{ color: t.colors.mutedFg, fontSize: 12 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Pressable onPress={onOpenSidebar} hitSlop={12}>
        <Text style={{ color: t.colors.primary, fontWeight: "600" }}>Info</Text>
      </Pressable>
    </View>
  );
}

function MessageBubble({ msg }: { msg: MessageRow }) {
  const t = useTheme();
  const isMe = msg.sender_type === "agent" || msg.sender_type === "bot";
  const isNote = !!msg.is_internal;
  const bg = isNote ? "#FEF3C7" : isMe ? t.colors.primary : t.colors.muted;
  const fg = isNote ? "#78350F" : isMe ? t.colors.primaryFg : t.colors.foreground;

  return (
    <View style={{ alignItems: isMe ? "flex-end" : "flex-start" }}>
      <View
        style={{
          maxWidth: "82%",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 16,
          backgroundColor: bg,
          borderTopRightRadius: isMe ? 4 : 16,
          borderTopLeftRadius: isMe ? 16 : 4,
        }}
      >
        {isNote ? (
          <Text style={{ color: fg, fontSize: 11, fontWeight: "700", marginBottom: 2 }}>
            INTERNAL NOTE
          </Text>
        ) : null}
        {msg.body ? <RichText value={msg.body} style={{ color: fg, fontSize: 15 }} /> : null}
        {msg.attachments?.map((a) => (
          <Text key={a.id} style={{ color: fg, fontSize: 12, marginTop: 4 }}>
            {a.mime_type?.startsWith("audio")
              ? `🎙 Voice note ${a.duration_ms ? `${Math.round(a.duration_ms / 1000)}s` : ""}`
              : a.mime_type?.startsWith("image")
                ? "🖼 Image"
                : `📎 ${a.name ?? "file"}`}
          </Text>
        ))}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          <Text style={{ color: fg, opacity: 0.7, fontSize: 10 }}>
            {new Date(msg.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          {isMe ? (
            <Text style={{ color: fg, opacity: 0.7, fontSize: 10 }}>
              {msg.status === "read"
                ? "✓✓"
                : msg.status === "delivered"
                  ? "✓✓"
                  : msg.status === "sent"
                    ? "✓"
                    : ""}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function IconBtn({
  label,
  onPress,
  tone = "default",
}: {
  label: string;
  onPress: () => void;
  tone?: "default" | "destructive";
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone === "destructive" ? t.colors.destructive : t.colors.muted,
      }}
    >
      <Text style={{ color: tone === "destructive" ? "#fff" : t.colors.foreground, fontSize: 16 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function FormatBtn({
  label,
  hint,
  marker,
  onPress,
}: {
  label: string;
  hint: string;
  marker: RichMarker;
  onPress: (marker: RichMarker) => void;
}) {
  const t = useTheme();
  const extra: TextStyle =
    marker === "*"
      ? { fontWeight: "700" }
      : marker === "_"
        ? { fontStyle: "italic" }
        : marker === "~"
          ? { textDecorationLine: "line-through" }
          : { fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }) };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={() => onPress(marker)}
      hitSlop={6}
      style={({ pressed }) => ({
        minWidth: 30,
        height: 28,
        paddingHorizontal: 8,
        borderRadius: t.radius.sm,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.colors.muted,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={[{ color: t.colors.mutedFg, fontSize: 13 }, extra]}>{label}</Text>
    </Pressable>
  );
}

function QuickReplyPicker({
  open,
  replies,
  onClose,
  onPick,
}: {
  open: boolean;
  replies: any[];
  onClose: () => void;
  onPick: (body: string) => void;
}) {
  const t = useTheme();
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "#00000066" }} onPress={onClose} />
      <View
        style={{
          maxHeight: "60%",
          backgroundColor: t.colors.background,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: t.spacing.lg,
        }}
      >
        <Text style={[t.typography.h3, { color: t.colors.foreground, marginBottom: 8 }]}>
          Quick replies
        </Text>
        <ScrollView>
          {replies.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => onPick(r.body ?? "")}
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: t.colors.border,
              }}
            >
              <Text style={{ color: t.colors.foreground, fontWeight: "600" }}>{r.name}</Text>
              <Text style={{ color: t.colors.mutedFg, fontSize: 12 }} numberOfLines={2}>
                {stripFormatting(r.body)}
              </Text>
            </Pressable>
          ))}
          {replies.length === 0 ? (
            <Text style={{ color: t.colors.mutedFg }}>No quick replies configured.</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function CustomerSidebar({
  open,
  onClose,
  contact,
  conversation,
  notes,
}: {
  open: boolean;
  onClose: () => void;
  contact: any;
  conversation: any;
  notes: any[];
}) {
  const t = useTheme();
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <Screen>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[t.typography.h2, { color: t.colors.foreground, flex: 1 }]}>Customer</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: t.colors.primary, fontWeight: "600" }}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: t.spacing.md, paddingTop: t.spacing.md }}>
          <SectionTitle>Profile</SectionTitle>
          <Field label="Name" value={contact?.display_name ?? contact?.name ?? "—"} />
          <Field label="Email" value={contact?.email ?? "—"} />
          <Field label="Phone" value={contact?.phone ?? "—"} />
          <Field label="Company" value={contact?.company_name ?? "—"} />

          <SectionTitle>Conversation</SectionTitle>
          <Field label="Channel" value={conversation?.channel ?? "—"} />
          <Field label="Status" value={conversation?.status ?? "—"} />
          <Field label="Assignee" value={conversation?.assignee_id ?? "Unassigned"} />

          <SectionTitle>Internal notes ({notes.length})</SectionTitle>
          {notes.map((n) => (
            <View
              key={n.id}
              style={{ padding: 10, backgroundColor: "#FEF3C7", borderRadius: t.radius.md }}
            >
              <Text style={{ color: "#78350F", fontSize: 13 }}>{n.body}</Text>
              <Text style={{ color: "#78350F", opacity: 0.6, fontSize: 10, marginTop: 4 }}>
                {new Date(n.created_at).toLocaleString()}
              </Text>
            </View>
          ))}
        </ScrollView>
      </Screen>
    </Modal>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text
      style={{
        color: t.colors.mutedFg,
        fontSize: 11,
        letterSpacing: 0.6,
        fontWeight: "700",
        textTransform: "uppercase",
        marginTop: t.spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View>
      <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.colors.foreground, fontSize: 15 }}>{value}</Text>
    </View>
  );
}

async function uploadFile(
  uri: string,
  mime: string,
  conversationId: string,
): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bin = globalThis.atob
      ? globalThis.atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.split("/")[1] ?? "bin";
    const path = `mobile/${conversationId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("message-attachments").upload(path, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from("message-attachments").getPublicUrl(path).data.publicUrl;
  } catch (e: any) {
    Alert.alert("Upload failed", e?.message ?? "Try again");
    return null;
  }
}
