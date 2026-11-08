/**
 * Runtime theme application — merge theme tokens + overrides into :root.
 * Called from the White Label / Theme provider once the workspace loads.
 */
export type ThemeTokens = Record<string, string>;

/**
 * Last value written for each custom property. Writing to `style` invalidates
 * style/layout for the whole document, so re-applying an identical token is a
 * wasted repaint — providers re-run on every render and would otherwise touch
 * `:root` continuously.
 */
const applied = new Map<string, string>();
const layers = new Map<string, ThemeTokens>();

function syncThemeTokens() {
  if (typeof document === 'undefined') return;
  const merged = Object.assign({}, ...layers.values()) as ThemeTokens;
  const root = document.documentElement;
  for (const name of applied.keys()) {
    if (name in merged) continue;
    root.style.removeProperty(name);
    applied.delete(name);
  }
  for (const [name, value] of Object.entries(merged)) {
    if (applied.get(name) === value) continue;
    root.style.setProperty(name, value);
    applied.set(name, value);
  }
}

/** Workspace branding sits above the base accent tokens. Removing a layer
 * restores any value supplied by the layer beneath it. */
export function setThemeTokenLayer(layer: 'base' | 'workspace', tokens: ThemeTokens | null) {
  const normalized: ThemeTokens = {};
  for (const [key, value] of Object.entries(tokens ?? {})) {
    if (!value) continue;
    normalized[key.startsWith('--') ? key : `--${key}`] = String(value);
  }
  if (layer === 'base') {
    const workspace = layers.get('workspace');
    layers.clear();
    layers.set('base', normalized);
    if (workspace) layers.set('workspace', workspace);
  } else if (tokens) {
    layers.set('workspace', normalized);
  } else {
    layers.delete('workspace');
  }
  syncThemeTokens();
}

export function applyThemeTokens(tokens: ThemeTokens | null | undefined, overrides?: ThemeTokens | null) {
  setThemeTokenLayer('base', { ...(tokens ?? {}), ...(overrides ?? {}) });
}

export function clearThemeTokens(tokens: ThemeTokens | null | undefined) {
  if (typeof document === 'undefined' || !tokens) return;
  const base = { ...(layers.get('base') ?? {}) };
  for (const key of Object.keys(tokens)) delete base[key.startsWith('--') ? key : `--${key}`];
  setThemeTokenLayer('base', base);
}
