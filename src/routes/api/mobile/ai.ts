/**
 * Unified mobile AI Assistant endpoint. Every action dispatches through the
 * shared AI Provider Engine (runChat) so mobile inherits provider fallback,
 * rate limits, logging, and cost tracking.
 *
 * POST /api/mobile/ai
 * Body: { action: string, workspace_id: string, ...params }
 */
import { ilikePattern, orIlike } from '@/lib/api/postgrest-filters';
import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { runChat } from '@/lib/ai/complete.functions';
import { getPlatformBranding } from '@/lib/admin/platform-branding.functions';
import {
  authenticateMobileRequest,
  requireWorkspaceMembership,
} from '@/lib/api/mobile-auth.server';


type Action =
  | 'chat'
  | 'reply'
  | 'summarize_conversation'
  | 'crm_summary'
  | 'customer_insights'
  | 'meeting_summary'
  | 'task_suggestions'
  | 'qualify_lead'
  | 'search'
  | 'command';

type Body = {
  action: Action;
  workspace_id: string;
  conversation_id?: string;
  contact_id?: string;
  deal_id?: string;
  lead_id?: string;
  transcript?: string;
  query?: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  json?: boolean;
};

const systemPrompts = (brandName: string) => ({
  chat:
    `You are ${brandName} AI, the in-app assistant for a support & sales agent. Be concise, factual, and action-oriented. If the user asks to perform an app action, respond with a JSON command envelope.`,
  reply:
    'You are a helpful support agent. Draft a short, friendly reply. Never invent facts.',
  summarize_conversation:
    'Summarize the customer conversation in 4-6 bullet points: intent, key facts, sentiment, and next best action.',
  crm_summary:
    'Summarize this CRM contact: profile, engagement, open deals & tickets, notable activity, and recommended next step.',
  customer_insights:
    'Extract customer insights: intent signals, buying stage, objections, opportunities, risks. Return short bullets.',
  meeting_summary:
    'Summarize this meeting transcript. Return: Summary (3-5 sentences), Decisions, Action Items (with owners if named), Follow-ups.',
  task_suggestions:
    'Suggest 3-6 concrete follow-up tasks for this record. Return each on one line as: "• {title} — {why}".',
  qualify_lead:
    'Qualify this lead using BANT+CHAMP heuristics. Return: score (0-100), tier (hot/warm/cold), reasoning (2-3 bullets), recommended action.',
  search:
    'You are a search assistant. Given the query and provided context snippets, return the most relevant matches with a one-line explanation each.',
  command:
    'Convert the user request to a JSON command. Schema: {"intent": string, "entity": string, "params": object, "confirm": string}. Only JSON, no prose. Supported intents: create_task, create_note, send_message, schedule_meeting, move_deal_stage, qualify_lead, search, summarize.',
}) as const;

async function loadContext(
  supabase: ReturnType<typeof createClient<Database>>,
  body: Body,
): Promise<string> {
  const parts: string[] = [];
  if (body.conversation_id) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('sender_type, body, created_at')
      .eq('conversation_id', body.conversation_id)
      .order('created_at', { ascending: false })
      .limit(30);
    const t = (msgs ?? [])
      .reverse()
      .map((m: any) => `${m.sender_type === 'agent' ? 'Agent' : 'Customer'}: ${m.body ?? ''}`)
      .join('\n');
    if (t) parts.push(`Conversation:\n${t}`);
  }
  if (body.contact_id) {
    const { data: c } = await supabase
      .from('contacts')
      .select('first_name,last_name,email,phone,company_id,lead_status,lifecycle_stage,notes,last_contact_at')
      .eq('id', body.contact_id)
      .maybeSingle();
    if (c) parts.push(`Contact: ${JSON.stringify(c)}`);
    const { data: acts } = await supabase
      .from('sales_activities')
      .select('type, subject, description, created_at')
      .eq('entity_type', 'contact')
      .eq('entity_id', body.contact_id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (acts?.length) parts.push(`Recent activity:\n${acts.map((a: any) => `- ${a.type}: ${a.subject ?? ''} ${a.description ?? ''}`).join('\n')}`);
  }
  if (body.deal_id) {
    const { data: d } = await supabase
      .from('deals')
      .select('title, value, currency, probability, expected_close_date, stage_id, description')
      .eq('id', body.deal_id)
      .maybeSingle();
    if (d) parts.push(`Deal: ${JSON.stringify(d)}`);
  }
  if (body.lead_id) {
    const { data: l } = await supabase
      .from('leads')
      .select('first_name,last_name,email,phone,company,source,budget,timeline,pain_point,notes,score')
      .eq('id', body.lead_id)
      .maybeSingle();
    if (l) parts.push(`Lead: ${JSON.stringify(l)}`);
  }
  if (body.transcript) parts.push(`Transcript:\n${body.transcript}`);
  return parts.join('\n\n');
}

async function runSearch(
  supabase: ReturnType<typeof createClient<Database>>,
  workspaceId: string,
  query: string,
) {
  const q = ilikePattern(query);
  if (!q) return { contacts: [], deals: [], messages: [], tasks: [] };
  const [contacts, deals, msgs, tasks] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone')
      .eq('workspace_id', workspaceId)
      .or(orIlike(['first_name', 'last_name', 'email', 'phone'], query)!)
      .limit(5),
    supabase
      .from('deals')
      .select('id, title, value, currency')
      .eq('workspace_id', workspaceId)
      .ilike('title', q)
      .limit(5),
    supabase
      .from('messages')
      .select('id, conversation_id, body, created_at')
      .eq('workspace_id', workspaceId)
      .ilike('body', q)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('tasks')
      .select('id, title, status, due_date')
      .eq('workspace_id', workspaceId)
      .ilike('title', q)
      .limit(5),
  ]);
  return {
    contacts: contacts.data ?? [],
    deals: deals.data ?? [],
    messages: msgs.data ?? [],
    tasks: tasks.data ?? [],
  };
}

export const Route = createFileRoute('/api/mobile/ai')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authed = await authenticateMobileRequest(request);
        if ("response" in authed) return authed.response;

        const body = (await request.json().catch(() => ({}))) as Body;
        if (!body.action || !body.workspace_id) {
          return new Response('action and workspace_id required', { status: 400 });
        }
        const { platformName } = await getPlatformBranding();
        const system = systemPrompts(platformName);
        if (!system[body.action]) {
          return new Response('Unsupported action', { status: 400 });
        }

        // The caller must actually belong to the workspace they are billing.
        const denied = await requireWorkspaceMembership(authed.auth, body.workspace_id);
        if (denied) return denied;

        const supabase = authed.auth.supabase;


        try {
          // Deterministic search: DB-backed matches + AI ranking commentary.
          if (body.action === 'search') {
            const hits = await runSearch(supabase, body.workspace_id, body.query ?? '');
            if (!body.query?.trim()) return Response.json({ results: hits, commentary: '' });
            const res = await runChat({
              workspaceId: body.workspace_id,
              feature: 'mobile_ai_search',
              request: {
                model: 'auto',
                messages: [
                  { role: 'system', content: system.search },
                  { role: 'user', content: `Query: ${body.query}\n\nContext:\n${JSON.stringify(hits)}` },
                ],
              },
            });
            return Response.json({ results: hits, commentary: res.content ?? '' });
          }

          const ctx = await loadContext(supabase, body);
          const userPrompt =
            body.action === 'chat'
              ? (body.messages ?? []).map((m) => `${m.role}: ${m.content}`).join('\n')
              : body.action === 'command'
                ? body.query ?? ''
                : `${ctx || '(no context)'}\n\nUser: ${body.query ?? ''}`.trim();

          const res = await runChat({
            workspaceId: body.workspace_id,
            feature: `mobile_ai_${body.action}`,
            request: {
              model: 'auto',
              response_format: body.action === 'command' || body.json ? 'json_object' : 'text',
              messages: [
                { role: 'system', content: system[body.action] },
                ...(body.action === 'chat'
                  ? (body.messages ?? []).map((m) => ({ role: m.role, content: m.content }))
                  : [{ role: 'user' as const, content: userPrompt }]),
              ],
            },
          });
          return Response.json({
            content: res.content ?? '',
            model: (res as any).model,
            usage: (res as any).usage,
          });
        } catch (e: any) {
          return new Response(e?.message ?? 'AI failed', { status: 500 });
        }
      },
    },
  },
});
