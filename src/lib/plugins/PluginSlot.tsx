import type { ReactNode } from 'react';
import { usePluginWidgets, usePluginInjections } from './use-extension-registry';
import type { ExtensionRegion } from './extension-registry';

/**
 * <PluginSlot region="inbox.sidebar" context={{ conversationId }} />
 *
 * Renders every widget + component injection registered at a region.
 * Widget failures are isolated per contribution.
 */
export function PluginSlot({
  region,
  context = {},
  fallback = null,
}: {
  region: ExtensionRegion;
  context?: Record<string, unknown>;
  fallback?: ReactNode;
}) {
  const widgets = usePluginWidgets(region);
  const injections = usePluginInjections(region);

  const nodes: ReactNode[] = [];
  for (const w of widgets) {
    if (w.when && !w.when(context)) continue;
    try {
      nodes.push(<div key={`w:${w.pluginSlug}:${w.id}`} data-plugin={w.pluginSlug}>{w.render({ context })}</div>);
    } catch (err) {
      console.error(`[plugin-slot] widget ${w.pluginSlug}:${w.id} failed`, err);
    }
  }
  for (const i of injections) {
    const Comp = i.component;
    try {
      nodes.push(<div key={`i:${i.pluginSlug}:${i.id}`} data-plugin={i.pluginSlug}><Comp {...context} /></div>);
    } catch (err) {
      console.error(`[plugin-slot] injection ${i.pluginSlug}:${i.id} failed`, err);
    }
  }

  if (nodes.length === 0) return <>{fallback}</>;
  return <>{nodes}</>;
}
