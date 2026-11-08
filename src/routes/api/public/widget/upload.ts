/**
 * Public widget file upload. Accepts multipart/form-data with `file`,
 * `sessionId`, and `visitorToken`. Stores in the private `widget-uploads`
 * bucket under `<workspaceId>/<sessionId>/<uuid>-<name>` and returns a
 * long-lived signed URL plus metadata that the client then attaches to a
 * chat message.
 */
import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "crypto";
import { verifyVisitor, checkWidgetRate } from "@/lib/widget/widget-runtime.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const IMAGE_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/heif",
]);
const AUDIO_MIMES = new Set([
  "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav",
  "audio/m4a", "audio/x-m4a",
]);
const DOC_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
]);

function classify(mime: string): "image" | "audio" | "document" | null {
  if (IMAGE_MIMES.has(mime)) return "image";
  if (AUDIO_MIMES.has(mime) || mime.startsWith("audio/")) return "audio";
  if (DOC_MIMES.has(mime)) return "document";
  return null;
}

export const Route = createFileRoute("/api/public/widget/upload")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown";
        if (!checkWidgetRate(`upload:${ip}`, 15)) {
          return json(429, { error: "Too many uploads — try again in a moment" });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json(400, { error: "Invalid form data" });
        }

        const sessionId = String(form.get("sessionId") ?? "");
        const visitorToken = String(form.get("visitorToken") ?? "");
        const file = form.get("file");

        if (!sessionId || !visitorToken) return json(400, { error: "Missing session" });
        if (!(file instanceof File)) return json(400, { error: "No file provided" });
        if (file.size === 0) return json(400, { error: "Empty file" });
        if (file.size > MAX_SIZE) return json(413, { error: "File too large (max 25 MB)" });

        const kind = classify(file.type);
        if (!kind) return json(415, { error: "Unsupported file type" });

        if (!verifyVisitor(sessionId, visitorToken)) {
          return json(401, { error: "Invalid session" });
        }

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: sess } = await supabaseAdmin
          .from("chatbot_sessions")
          .select("id, workspace_id, status")
          .eq("id", sessionId)
          .maybeSingle();
        if (!sess) return json(404, { error: "Session not found" });
        const s = sess as { id: string; workspace_id: string; status: string };
        if (s.status === "closed") return json(410, { error: "Session closed" });

        const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
        const path = `${s.workspace_id}/${sessionId}/${randomUUID()}-${safeName}`;
        const buf = new Uint8Array(await file.arrayBuffer());

        const { error: upErr } = await supabaseAdmin.storage
          .from("widget-uploads")
          .upload(path, buf, { contentType: file.type, upsert: false });
        if (upErr) {
          console.error("[widget upload]", upErr.message);
          return json(500, { error: "Upload failed" });
        }

        // 7-day signed URL — comfortably outlives one conversation.
        const { data: signed, error: signErr } = await supabaseAdmin.storage
          .from("widget-uploads")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (signErr || !signed?.signedUrl) {
          return json(500, { error: "Could not sign URL" });
        }

        return json(200, {
          attachment: {
            url: signed.signedUrl,
            name: file.name,
            mime: file.type,
            size: file.size,
            kind,
          },
        });
      },
    },
  },
});
