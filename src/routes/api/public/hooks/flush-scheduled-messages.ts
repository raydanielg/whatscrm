import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * Public hook that flushes due `scheduled_messages` into `messages`.
 *
 * Invoked by `pg_cron` every minute. Authenticated at the edge via the
 * private `x-cron-token` header matching INTERNAL_CRON_TOKEN.
 *
 * Uses the service role client (RLS bypassed) because the caller is a
 * scheduler, not a signed-in user; every write is scoped to a specific
 * scheduled_messages row already owned by a workspace member.
 */
export const Route = createFileRoute("/api/public/hooks/flush-scheduled-messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

          const nowIso = new Date().toISOString();
          const { data: due, error } = await supabaseAdmin
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from("scheduled_messages" as any)
            .select("*")
            .eq("status", "pending")
            .lte("scheduled_for", nowIso)
            .limit(100);

          if (error) {
            return json({ ok: false, error: error.message }, 500);
          }

          const results: Array<{ id: string; status: string; error?: string }> = [];

          for (const row of ((due ?? []) as unknown) as Array<{
            id: string;
            workspace_id: string;
            conversation_id: string;
            created_by: string | null;
            body: string;
            message_type: string;
            metadata: Record<string, unknown>;
            attachments: unknown[];
          }>) {
            try {
              const meta = (row.metadata ?? {}) as Record<string, unknown>;
              let providerMessageId: string | null = null;

              // Messenger scheduled sends dispatch via Meta Graph API.
              if (meta.channel === "messenger") {
                const pageId = String(meta.page_id ?? "");
                const psid = String(meta.recipient_psid ?? "");
                const messengerAccountId = String(meta.messenger_account_id ?? "");
                const attachment = (meta.attachment ?? null) as
                  | { type: "image" | "video" | "audio" | "file"; url: string }
                  | null;

                if (!pageId || !psid || !messengerAccountId) {
                  throw new Error("Missing messenger routing metadata");
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: tokRow } = await (sbAny(supabaseAdmin).from("messenger_accounts" as any) as any)
                  .select("access_token_ciphertext, page_id, status")
                  .eq("id", messengerAccountId)
                  .maybeSingle();
                if (!tokRow?.access_token_ciphertext) {
                  throw new Error("Page access token missing — reconnect the page");
                }
                if (tokRow.status !== "connected") {
                  throw new Error("Messenger account not connected");
                }
                const { sendMessengerMessage } = await import("@/lib/messenger/send.server");
                let sent;
                try {
                  sent = await sendMessengerMessage({
                    pageId: tokRow.page_id ?? pageId,
                    accessTokenCipher: tokRow.access_token_ciphertext,
                    recipientPsid: psid,
                    text: row.body,
                    attachment,
                    messagingType: (meta.messaging_type as "RESPONSE" | "UPDATE" | "MESSAGE_TAG" | undefined) ?? "RESPONSE",
                    tag: (meta.tag as string | null | undefined) ?? null,
                  });
                } catch (sendErr) {
                  const { handleMessengerSendError } = await import("@/lib/messenger/token.server");
                  await handleMessengerSendError(messengerAccountId, sendErr);
                  throw sendErr;
                }
                providerMessageId = sent.messageId || null;
              }

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: msg, error: mErr } = await (sbAny(supabaseAdmin).from("messages" as any) as any)
                .insert({
                  workspace_id: row.workspace_id,
                  conversation_id: row.conversation_id,
                  sender_user_id: row.created_by,
                  direction: "outbound",
                  message_type: row.message_type ?? "text",
                  body: row.body,
                  metadata: {
                    ...(row.metadata ?? {}),
                    scheduled_message_id: row.id,
                  },
                  status: "sent",
                  provider: meta.channel === "messenger" ? "messenger" : undefined,
                  provider_message_id: providerMessageId,
                })
                .select("id")
                .single();

              if (mErr) throw mErr;

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (sbAny(supabaseAdmin).from("scheduled_messages" as any) as any)
                .update({
                  status: "sent",
                  sent_at: new Date().toISOString(),
                  sent_message_id: (msg as { id: string })?.id ?? null,
                })
                .eq("id", row.id);

              results.push({ id: row.id, status: "sent" });
            } catch (e) {
              const msg = (e as Error).message ?? String(e);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (sbAny(supabaseAdmin).from("scheduled_messages" as any) as any)
                .update({ status: "failed", error: msg })
                .eq("id", row.id);
              results.push({ id: row.id, status: "failed", error: msg });
            }
          }

          return json({ ok: true, processed: results.length, results });
        } catch (e) {
          return json({ ok: false, error: (e as Error).message }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
