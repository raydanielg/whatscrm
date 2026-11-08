/**
 * Performance + startup helpers.
 * - keepSplashUntilReady: hold the native splash until first paint.
 * - InteractionBatch: defer expensive work until after animations.
 * - measure: perf timers surfaced in __DEV__.
 */
import { InteractionManager } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

let splashHeld = false;

export async function keepSplashUntilReady() {
  if (splashHeld) return;
  splashHeld = true;
  try {
    await SplashScreen.preventAutoHideAsync();
  } catch {}
}

export async function hideSplash() {
  try {
    await SplashScreen.hideAsync();
  } catch {}
}

/** Run heavy work after interactions settle. */
export function afterInteractions<T>(fn: () => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    InteractionManager.runAfterInteractions(async () => {
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
    });
  });
}

export function measure<T>(label: string, fn: () => T): T {
  if (!__DEV__) return fn();
  const t0 = Date.now();
  const r = fn();
  console.log(`[perf] ${label}: ${Date.now() - t0}ms`);
  return r;
}

/** LRU-ish size cap for in-memory caches to prevent unbounded growth. */
export class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly cap: number = 200) {
    super();
  }
  set(k: K, v: V): this {
    if (this.size >= this.cap) {
      const first = this.keys().next().value as K | undefined;
      if (first !== undefined) this.delete(first);
    }
    return super.set(k, v);
  }
}
