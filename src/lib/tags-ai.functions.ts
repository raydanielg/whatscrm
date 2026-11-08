import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { GEMINI_CHAT_URL, GEMINI_DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini.server";

const InputSchema = z.object({
  entityType: z.enum(["contact", "company", "lead", "customer", "deal", "task"]),
  context: z.string().min(1).max(4000),
  existingTags: z.array(z.string()).default([]),
});

/**
 * Ask Lovable AI to suggest 3-6 short tags for the given entity context.
 * Returns an array of tag names only (no colors/ids). Client decides what to create.
 */
export const suggestTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not configured");

    const prompt = `You classify CRM records with short, reusable tags.

Entity type: ${data.entityType}
Existing workspace tags: ${data.existingTags.slice(0, 100).join(", ") || "(none)"}

Record context:
${data.context}

Return 3-6 concise lowercase tags (1-3 words each) that describe this record.
Prefer reusing existing tags when they fit. Avoid duplicates and PII.
Respond with ONLY a JSON array of strings, no prose.`;

    const res = await fetch(GEMINI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_DEFAULT_CHAT_MODEL,
        messages: [
          { role: "system", content: "You output only valid JSON arrays of strings." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI gateway ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "[]";
    // The model may return {tags:[...]} or [...]; normalize either.
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) tags = parsed;
      else if (Array.isArray(parsed?.tags)) tags = parsed.tags;
      else {
        const first = Object.values(parsed).find((v) => Array.isArray(v));
        if (Array.isArray(first)) tags = first as string[];
      }
    } catch {
      // fall back: extract bracketed array
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) tags = JSON.parse(m[0]);
    }
    return {
      tags: tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 6),
    };
  });
