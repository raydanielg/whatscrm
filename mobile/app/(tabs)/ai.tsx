/**
 * WACRM AI Assistant — mobile companion for the shared AI Provider Engine.
 * Freeform chat, voice input (speech-to-text), voice output (text-to-speech),
 * and quick tools: reply, summary, CRM summary, insights, meeting summary,
 * task suggestions, lead qualification, AI search, and NL commands.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { aiApi, synthesizeSpeech, transcribeAudio } from '@/api/ai';

type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string };

const QUICK_TOOLS: Array<{ label: string; prompt: string; action?: 'search' | 'command' }> = [
  { label: '🔍 Search', prompt: 'Search my workspace for ', action: 'search' },
  { label: '⚡ Command', prompt: 'Create a task to ', action: 'command' },
  { label: '📝 Meeting notes', prompt: 'Summarize this meeting:\n' },
  { label: '💡 Ideas', prompt: 'Suggest 5 tasks for my top deals this week' },
];

export default function AIAssistantScreen() {
  const t = useTheme();
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'sys',
      role: 'assistant',
      content:
        "Hi, I'm your WACRM AI Assistant. Ask me anything — draft replies, summaries, insights, tasks, lead scoring, or use / for commands.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const listRef = useRef<FlatList<ChatMsg>>(null);

  const send = useCallback(
    async (text: string, opts: { asCommand?: boolean; asSearch?: boolean } = {}) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
      setMessages((m) => [...m, userMsg]);
      setInput('');
      setBusy(true);
      try {
        let assistantContent = '';
        if (opts.asSearch) {
          const r = await aiApi.search(trimmed);
          const groups = Object.entries(r.results)
            .map(([k, v]) => (v.length ? `**${k}** (${v.length})` : ''))
            .filter(Boolean)
            .join(' · ');
          assistantContent = `${r.commentary || 'Results:'}\n\n${groups}`;
        } else if (opts.asCommand) {
          const r = await aiApi.command(trimmed);
          assistantContent = `Command:\n${r.content}`;
        } else {
          const history = [...messages, userMsg]
            .filter((m) => m.id !== 'sys')
            .map((m) => ({ role: m.role, content: m.content }));
          const r = await aiApi.chat(history);
          assistantContent = r.content;
        }
        setMessages((m) => [
          ...m,
          { id: `a-${Date.now()}`, role: 'assistant', content: assistantContent },
        ]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      } catch (e: any) {
        setMessages((m) => [
          ...m,
          { id: `err-${Date.now()}`, role: 'assistant', content: `⚠️ ${e?.message ?? 'AI failed'}` },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages],
  );

  const startRec = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) throw new Error('Microphone permission denied');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { id: `err-${Date.now()}`, role: 'assistant', content: `🎙️ ${e?.message ?? 'Mic failed'}` },
      ]);
    }
  }, []);

  const stopRec = useCallback(async () => {
    if (!recording) return;
    setBusy(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) return;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || (info.size ?? 0) < 2048) throw new Error('Recording too short');
      const text = await transcribeAudio(uri, Platform.OS === 'ios' ? 'audio/mp4' : 'audio/m4a');
      if (text) await send(text);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { id: `err-${Date.now()}`, role: 'assistant', content: `🎙️ ${e?.message ?? 'STT failed'}` },
      ]);
    } finally {
      setBusy(false);
    }
  }, [recording, send]);

  const speak = useCallback(async (msg: ChatMsg) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      if (speaking === msg.id) {
        setSpeaking(null);
        return;
      }
      setSpeaking(msg.id);
      const dataUri = await synthesizeSpeech(msg.content.slice(0, 4000));
      const { sound } = await Audio.Sound.createAsync({ uri: dataUri }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((s) => {
        if ('didJustFinish' in s && s.didJustFinish) setSpeaking(null);
      });
    } catch (e: any) {
      setSpeaking(null);
      setMessages((m) => [
        ...m,
        { id: `err-${Date.now()}`, role: 'assistant', content: `🔊 ${e?.message ?? 'TTS failed'}` },
      ]);
    }
  }, [speaking]);

  const renderItem = useCallback(
    ({ item }: { item: ChatMsg }) => {
      const mine = item.role === 'user';
      return (
        <View style={{ marginBottom: t.spacing.md, alignItems: mine ? 'flex-end' : 'flex-start' }}>
          <View
            style={{
              maxWidth: '86%',
              backgroundColor: mine ? t.colors.primary : t.colors.muted,
              paddingHorizontal: t.spacing.md,
              paddingVertical: t.spacing.sm,
              borderRadius: t.radius.lg,
            }}
          >
            <Text style={{ color: mine ? t.colors.primaryFg : t.colors.foreground, fontSize: 15, lineHeight: 21 }}>
              {item.content}
            </Text>
          </View>
          {!mine && item.id !== 'sys' ? (
            <Pressable onPress={() => speak(item)} style={{ marginTop: 4 }}>
              <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>
                {speaking === item.id ? '⏸ Stop' : '🔊 Speak'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [t, speak, speaking],
  );

  const tools = useMemo(() => QUICK_TOOLS, []);

  return (
    <Screen style={{ padding: 0 }}>
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md }}>
        <Text style={[t.typography.h2, { color: t.colors.foreground }]}>AI Assistant</Text>
        <Text style={{ color: t.colors.mutedFg, marginTop: 2, fontSize: 13 }}>
          Powered by the WACRM AI Provider Engine
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, gap: 8 }}
      >
        {tools.map((tool) => (
          <Pressable
            key={tool.label}
            onPress={() => {
              setInput(tool.prompt);
              if (tool.action === 'search') void send(tool.prompt, { asSearch: true });
              else if (tool.action === 'command') void send(tool.prompt, { asCommand: true });
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: t.radius.full,
              backgroundColor: t.colors.muted,
              borderWidth: 1,
              borderColor: t.colors.border,
            }}
          >
            <Text style={{ color: t.colors.foreground, fontSize: 13, fontWeight: '500' }}>
              {tool.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.md }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.md,
            borderTopWidth: 1,
            borderTopColor: t.colors.border,
            backgroundColor: t.colors.background,
            gap: 8,
          }}
        >
          <Pressable
            onPressIn={startRec}
            onPressOut={stopRec}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: recording ? t.colors.destructive : t.colors.muted,
            }}
          >
            <Text style={{ fontSize: 18 }}>{recording ? '⏺' : '🎙'}</Text>
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask AI anything (/ for command)"
            placeholderTextColor={t.colors.mutedFg}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: t.radius.md,
              backgroundColor: t.colors.muted,
              color: t.colors.foreground,
              fontSize: 15,
            }}
            multiline
            editable={!busy}
          />
          <Pressable
            onPress={() => {
              if (input.trim().startsWith('/')) void send(input.replace(/^\//, ''), { asCommand: true });
              else void send(input);
            }}
            disabled={busy || !input.trim()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: busy || !input.trim() ? t.colors.muted : t.colors.primary,
            }}
          >
            {busy ? <ActivityIndicator color={t.colors.primaryFg} /> : (
              <Text style={{ color: input.trim() ? t.colors.primaryFg : t.colors.mutedFg, fontSize: 18 }}>➤</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
