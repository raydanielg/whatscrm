/**
 * Mobile AI Assistant client. Every call routes through /api/mobile/ai on
 * the web backend, which delegates to the shared AI Provider Engine.
 */
import { supabase } from '@/api/supabase';
import { env } from '@/lib/env';
import { useAppStore } from '@/stores/appStore';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function call<T = { content: string }>(payload: Record<string, unknown>): Promise<T> {
  const workspace_id = useAppStore.getState().activeWorkspace;
  if (!workspace_id) throw new Error('No active workspace');
  const res = await fetch(`${env.API_BASE_URL}/api/mobile/ai`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ workspace_id, ...payload }),
  });
  if (!res.ok) throw new Error(`AI failed (${res.status}): ${await res.text().catch(() => '')}`);
  return (await res.json()) as T;
}

export const aiApi = {
  chat: (messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>) =>
    call({ action: 'chat', messages }),
  reply: (conversation_id: string) => call({ action: 'reply', conversation_id }),
  summarizeConversation: (conversation_id: string) =>
    call({ action: 'summarize_conversation', conversation_id }),
  crmSummary: (contact_id: string) => call({ action: 'crm_summary', contact_id }),
  customerInsights: (contact_id: string) => call({ action: 'customer_insights', contact_id }),
  meetingSummary: (transcript: string) => call({ action: 'meeting_summary', transcript }),
  taskSuggestions: (opts: { contact_id?: string; deal_id?: string }) =>
    call({ action: 'task_suggestions', ...opts }),
  qualifyLead: (lead_id: string) => call({ action: 'qualify_lead', lead_id }),
  search: (query: string) =>
    call<{ results: Record<string, unknown[]>; commentary: string }>({ action: 'search', query }),
  command: (query: string) => call<{ content: string }>({ action: 'command', query, json: true }),
};

/** Speech-to-text: uploads an m4a/wav/webm file to the STT proxy. */
export async function transcribeAudio(uri: string, mime = 'audio/mp4'): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const form = new FormData();
  // React Native FormData accepts { uri, name, type }.
  form.append('file', { uri, name: mime.includes('wav') ? 'a.wav' : 'a.m4a', type: mime } as any);
  const res = await fetch(`${env.API_BASE_URL}/api/mobile/ai-stt`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(`STT failed (${res.status})`);
  const json = (await res.json()) as { text?: string };
  return json.text ?? '';
}

/** Text-to-speech: returns a base64 mp3 payload; play via expo-av. */
export async function synthesizeSpeech(text: string, voice = 'alloy'): Promise<string> {
  const res = await fetch(`${env.API_BASE_URL}/api/mobile/ai-tts`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) throw new Error(`TTS failed (${res.status})`);
  const json = (await res.json()) as { audio_base64: string; mime: string };
  return `data:${json.mime};base64,${json.audio_base64}`;
}
