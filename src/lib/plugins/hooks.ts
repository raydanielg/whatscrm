/**
 * Hook System — WordPress-style actions, filters, and middleware over the Event Bus.
 *
 *   addAction / doAction       side-effect notifications
 *   addFilter / applyFilters   value transformers (return `null` to veto)
 *   addMiddleware / runAround  wrap a core operation with before/after logic
 *   before / after helpers     subscribe to lifecycle pairs around core writes
 *
 * Core code should call `doActionAround(name, payload, coreFn)` at every
 * extensibility point so plugins can observe, mutate, or wrap the operation
 * without modifying the core module.
 */
import { eventBus, type Middleware } from './event-bus';
import type { CatalogEvent } from './event-catalog';

export type HookName = CatalogEvent | string;

// ---------- Actions ----------
export function addAction(slug: string, name: HookName, fn: (payload: any) => void | Promise<void>, priority = 10) {
  return eventBus.on(slug, `action:${name}`, fn, priority);
}
export async function doAction(name: HookName, payload: unknown = {}) {
  await eventBus.emit(`action:${name}`, payload);
}

/** Subscribe specifically to the `before:` variant. */
export function addBeforeAction(slug: string, name: HookName, fn: (payload: any) => void | Promise<void>, priority = 10) {
  return eventBus.on(slug, `action:before:${name}`, fn, priority);
}
/** Subscribe specifically to the `after:` variant. */
export function addAfterAction(slug: string, name: HookName, fn: (payload: any) => void | Promise<void>, priority = 10) {
  return eventBus.on(slug, `action:after:${name}`, fn, priority);
}

/**
 * Fire before → run core → fire after. Filters and middleware are honored:
 * the payload is first threaded through `filter:<name>` filters (a veto here
 * cancels core execution) and then wrapped by `middleware:<name>` middleware.
 */
export async function doActionAround<T>(name: HookName, payload: T, core: (value: T) => Promise<void> | void): Promise<T | null> {
  const filtered = await eventBus.emitFiltered<T>(`filter:${name}`, payload);
  if (filtered === null) return null;
  await eventBus.emit(`action:before:${name}`, filtered);
  await eventBus.runPipeline(`middleware:${name}`, filtered, () => core(filtered));
  await eventBus.emit(`action:after:${name}`, filtered);
  await eventBus.emit(`action:${name}`, filtered);
  return filtered;
}

// ---------- Filters ----------
export function addFilter<T = unknown>(slug: string, name: HookName, fn: (v: T) => T | Promise<T> | null, priority = 10) {
  return eventBus.filter<T>(slug, `filter:${name}`, fn as any, priority);
}
export async function applyFilters<T>(name: HookName, value: T): Promise<T | null> {
  return eventBus.emitFiltered<T>(`filter:${name}`, value);
}

// ---------- Middleware ----------
export function addMiddleware<C = unknown>(slug: string, name: HookName, fn: Middleware<C>, priority = 10) {
  return eventBus.use<C>(slug, `middleware:${name}`, fn, priority);
}
export async function runAround<C>(name: HookName, ctx: C, core: () => Promise<void> | void): Promise<C> {
  return eventBus.runPipeline(`middleware:${name}`, ctx, core);
}
