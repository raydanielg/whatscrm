/**
 * Event Bus — typed pub/sub for the Extension Platform.
 *
 * Delivery modes:
 *  - `emit`          fire-and-forget action; every listener runs, failures isolated.
 *  - `emitFiltered`  chain of value transformers; each filter can mutate or veto.
 *  - `runPipeline`   koa-style middleware around a core operation with before/after hooks.
 *
 * Every subscription is plugin-scoped so the Plugin Manager can revoke them
 * atomically on disable/uninstall — no dangling listeners, no leaks.
 */

export type BusEventName = string;
type Handler<T = unknown> = (payload: T) => void | Promise<void>;
type Filter<T = unknown> = (payload: T) => T | Promise<T> | null | Promise<null>;
export type Middleware<C = unknown> = (ctx: C, next: () => Promise<void>) => void | Promise<void>;

type Kind = 'listen' | 'filter' | 'middleware';
type Subscription = {
  id: number;
  slug: string;
  event: BusEventName;
  kind: Kind;
  fn: any;
  priority: number;
};

class EventBus {
  private nextId = 1;
  private subs = new Map<BusEventName, Subscription[]>();
  private history: Array<{ event: BusEventName; at: number; kind: Kind }> = [];

  // ---------- subscription ----------
  on<T = unknown>(slug: string, event: BusEventName, fn: Handler<T>, priority = 10) {
    return this.add(slug, event, 'listen', fn, priority);
  }
  filter<T = unknown>(slug: string, event: BusEventName, fn: Filter<T>, priority = 10) {
    return this.add(slug, event, 'filter', fn, priority);
  }
  use<C = unknown>(slug: string, event: BusEventName, fn: Middleware<C>, priority = 10) {
    return this.add(slug, event, 'middleware', fn, priority);
  }

  private add(slug: string, event: BusEventName, kind: Kind, fn: any, priority: number) {
    const sub: Subscription = { id: this.nextId++, slug, event, kind, fn, priority };
    const list = this.subs.get(event) ?? [];
    list.push(sub);
    list.sort((a, b) => a.priority - b.priority);
    this.subs.set(event, list);
    return () => this.remove(sub.id);
  }

  private remove(id: number) {
    for (const [k, list] of this.subs) {
      const next = list.filter((s) => s.id !== id);
      if (next.length !== list.length) this.subs.set(k, next);
    }
  }

  /** Revoke every subscription owned by a plugin. */
  revokePlugin(slug: string) {
    for (const [k, list] of this.subs) {
      this.subs.set(k, list.filter((s) => s.slug !== slug));
    }
  }

  // ---------- emit ----------
  async emit<T = unknown>(event: BusEventName, payload: T): Promise<void> {
    this.record(event, 'listen');
    const list = this.subs.get(event);
    if (!list?.length) return;
    await Promise.allSettled(
      list.filter((s) => s.kind === 'listen').map(async (s) => {
        try { await s.fn(payload); }
        catch (err) { console.error(`[event-bus] ${event} listener ${s.slug} failed:`, err); }
      }),
    );
  }

  /** Fire the `before:` variant, then the base event, then the `after:` variant. */
  async emitAround<T>(event: BusEventName, payload: T): Promise<void> {
    await this.emit(`before:${event}`, payload);
    await this.emit(event, payload);
    await this.emit(`after:${event}`, payload);
  }

  async emitFiltered<T>(event: BusEventName, payload: T): Promise<T | null> {
    this.record(event, 'filter');
    const list = this.subs.get(event);
    if (!list?.length) return payload;
    let value: any = payload;
    for (const s of list.filter((s) => s.kind === 'filter')) {
      try {
        value = await s.fn(value);
        if (value === null) return null;
      } catch (err) {
        console.error(`[event-bus] ${event} filter ${s.slug} failed:`, err);
      }
    }
    return value;
  }

  /**
   * Run a koa-style middleware pipeline around a core operation.
   * Middleware can short-circuit by not calling `next()`, or wrap the core
   * call for timing, retries, auditing, etc.
   */
  async runPipeline<C>(event: BusEventName, ctx: C, core: () => Promise<void> | void): Promise<C> {
    this.record(event, 'middleware');
    const chain = (this.subs.get(event) ?? []).filter((s) => s.kind === 'middleware');
    let i = -1;
    const dispatch = async (idx: number): Promise<void> => {
      if (idx <= i) throw new Error(`[event-bus] next() called multiple times in ${event}`);
      i = idx;
      const sub = chain[idx];
      if (!sub) return void (await core());
      try { await sub.fn(ctx, () => dispatch(idx + 1)); }
      catch (err) { console.error(`[event-bus] ${event} middleware ${sub.slug} failed:`, err); }
    };
    await dispatch(0);
    return ctx;
  }

  // ---------- introspection ----------
  private record(event: BusEventName, kind: Kind) {
    this.history.push({ event, at: Date.now(), kind });
    if (this.history.length > 200) this.history.shift();
  }

  stats() {
    const byEvent: Record<string, { listen: number; filter: number; middleware: number }> = {};
    let total = 0;
    for (const [k, list] of this.subs) {
      byEvent[k] = { listen: 0, filter: 0, middleware: 0 };
      for (const s of list) { byEvent[k][s.kind]++; total++; }
    }
    return { events: byEvent, total, recent: this.history.slice(-50) };
  }

  listSubscriptions(slug?: string) {
    const out: Array<Omit<Subscription, 'fn'>> = [];
    for (const list of this.subs.values()) {
      for (const s of list) if (!slug || s.slug === slug) {
        out.push({ id: s.id, slug: s.slug, event: s.event, kind: s.kind, priority: s.priority });
      }
    }
    return out;
  }
}

export const eventBus = new EventBus();
