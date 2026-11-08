import { validateTemplateVariables } from "./variable-validation";

export function buildSendComponents(components: unknown, variables: Record<string, string>, mediaUrl?: string | null): Array<Record<string, unknown>> {
  const { issues } = validateTemplateVariables(components, variables);
  if (issues.length) throw new Error(issues[0].message);
  if (!Array.isArray(components)) return [];
  const result: Array<Record<string, unknown>> = [];
  const tokens = (text: string) => [...new Set(Array.from(text.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g), (m) => m[1]))];
  const parameters = (text: string) => tokens(text).map((token) => ({ type: "text", text: variables[token], ...(/^\d+$/.test(token) ? {} : { parameter_name: token }) }));
  for (const component of components) {
    const type = String(component.type).toUpperCase();
    if (type === "HEADER" && ["IMAGE", "VIDEO", "DOCUMENT"].includes(component.format)) {
      if (!mediaUrl || !/^https:\/\//i.test(mediaUrl)) throw new Error("This template requires an HTTPS header media URL.");
      const kind = component.format.toLowerCase();
      result.push({ type: "header", parameters: [{ type: kind, [kind]: { link: mediaUrl } }] });
    } else if (type === "HEADER" || type === "BODY") {
      const params = parameters(String(component.text ?? ""));
      if (params.length) result.push({ type: type.toLowerCase(), parameters: params });
    } else if (type === "BUTTONS") {
      for (const [index, button] of (component.buttons ?? []).entries()) {
        if (button.type === "URL") {
          const params = parameters(String(button.url ?? "")).map(({ type, text }) => ({ type, text }));
          if (params.length) result.push({ type: "button", sub_type: "url", index: String(index), parameters: params });
        }
      }
    }
  }
  return result;
}
