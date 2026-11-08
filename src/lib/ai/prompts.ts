/**
 * Prompt Engine — variable interpolation + template rendering. Templates use
 * `{{var}}` placeholders. Unknown variables render as an empty string so
 * partial contexts don't crash.
 */

import type { AIMessage } from "./types";

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function renderTemplate(template: string, variables: Record<string, unknown> = {}): string {
  return template.replace(VAR_RE, (_, key: string) => {
    const parts = key.split(".");
    let value: unknown = variables;
    for (const p of parts) {
      if (value == null) return "";
      value = (value as Record<string, unknown>)[p];
    }
    if (value == null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

export function extractVariables(template: string): string[] {
  const set = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) set.add(m[1]);
  return [...set];
}

export interface RenderedPrompt {
  system?: string;
  messages: AIMessage[];
}

export function renderPrompt(
  template: string,
  variables: Record<string, unknown>,
  opts: { systemPrompt?: string; history?: AIMessage[] } = {},
): RenderedPrompt {
  const user = renderTemplate(template, variables).trim();
  const messages: AIMessage[] = [];
  if (opts.history?.length) messages.push(...opts.history);
  if (user) messages.push({ role: "user", content: user });
  return { system: opts.systemPrompt, messages };
}
