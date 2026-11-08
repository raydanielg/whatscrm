/**
 * Public survey endpoints: fetch by public_token and submit responses.
 * These bypass auth by design (customers are anonymous) but validate the
 * token and rate-limit via metadata.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

const submitSchema = z.object({
  public_token: z.string().min(6).max(64),
  response_token: z.string().optional().nullable(),
  ticket_id: z.string().uuid().optional().nullable(),
  agent_id: z.string().uuid().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  rating: z.number().min(0).max(10).optional().nullable(),
  nps_score: z.number().min(0).max(10).optional().nullable(),
  ces_score: z.number().min(1).max(7).optional().nullable(),
  score_type: z.string().optional().nullable(),
  comment: z.string().max(4000).optional().nullable(),
  responses: z.record(z.string(), z.unknown()).default({}),
});

export const Route = createFileRoute("/api/public/surveys/submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const parsed = submitSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400, headers: { "content-type": "application/json" } });
        }
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: survey, error } = await sbAny(supabaseAdmin).from("csat_surveys")
          .select("id, workspace_id, survey_type, follow_up_survey_id, thank_you_message, is_active")
          .eq("public_token", parsed.data.public_token).maybeSingle();
        if (error || !survey) {
          return new Response(JSON.stringify({ error: "Survey not found" }), { status: 404, headers: { "content-type": "application/json" } });
        }
        const s = survey as { id: string; workspace_id: string; survey_type: string; follow_up_survey_id: string | null; thank_you_message: string | null; is_active: boolean };
        if (!s.is_active) {
          return new Response(JSON.stringify({ error: "Survey closed" }), { status: 410, headers: { "content-type": "application/json" } });
        }

        // Client-supplied foreign keys are untrusted: only keep the ones that
        // actually belong to this survey's workspace, otherwise an anonymous
        // caller could attribute fake feedback to any ticket/agent/department.
        async function scopedRef(
          table: "conversations" | "workspace_members" | "departments" | "contacts",
          column: "id" | "user_id",
          value: string | null | undefined,
        ): Promise<string | null> {
          if (!value) return null;
          const { data } = await (supabaseAdmin as never as {
            from: (t: string) => {
              select: (c: string) => {
                eq: (c: string, v: string) => {
                  eq: (c: string, v: string) => {
                    maybeSingle: () => Promise<{ data: unknown }>;
                  };
                };
              };
            };
          })
            .from(table)
            .select(column)
            .eq(column, value)
            .eq("workspace_id", s.workspace_id)
            .maybeSingle();
          return data ? value : null;
        }


        const ticketId = await scopedRef("conversations", "id", parsed.data.ticket_id);
        const agentId = await scopedRef("workspace_members", "user_id", parsed.data.agent_id);
        const departmentId = await scopedRef("departments", "id", parsed.data.department_id);
        const contactId = await scopedRef("contacts", "id", parsed.data.contact_id);

        // If response_token supplied (from outbound send), update that row

        const inserted = parsed.data.response_token
          ? await sbAny(supabaseAdmin).from("csat_responses").update({
              rating: parsed.data.rating ?? null,
              nps_score: parsed.data.nps_score ?? null,
              ces_score: parsed.data.ces_score ?? null,
              score_type: parsed.data.score_type ?? s.survey_type,
              comment: parsed.data.comment ?? null,
              responses: parsed.data.responses,
              submitted_at: new Date().toISOString(),
            } as never).eq("response_token", parsed.data.response_token)
              .eq("workspace_id", s.workspace_id).select("id").maybeSingle()
          : await sbAny(supabaseAdmin).from("csat_responses").insert({
              workspace_id: s.workspace_id,
              survey_id: s.id,
              ticket_id: ticketId,
              contact_id: contactId,
              agent_id: agentId,
              department_id: departmentId,

              rating: parsed.data.rating ?? null,
              nps_score: parsed.data.nps_score ?? null,
              ces_score: parsed.data.ces_score ?? null,
              score_type: parsed.data.score_type ?? s.survey_type,
              comment: parsed.data.comment ?? null,
              responses: parsed.data.responses,
            } as never).select("id").single();

        if (inserted.error) {
          return new Response(JSON.stringify({ error: inserted.error.message }), { status: 500, headers: { "content-type": "application/json" } });
        }

        return new Response(JSON.stringify({
          ok: true,
          thank_you: s.thank_you_message ?? "Thanks for your feedback!",
          follow_up_survey_id: s.follow_up_survey_id,
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  },
});
