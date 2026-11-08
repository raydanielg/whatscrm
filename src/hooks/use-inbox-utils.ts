import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/* -------------------------------------------------------------------------- */
/*  useNow — a single ticking clock shared across the app                     */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();
let currentNow = Date.now();
let intervalHandle: ReturnType<typeof setInterval> | null = null;

function subscribeNow(cb: () => void) {
  listeners.add(cb);
  if (!intervalHandle) {
    intervalHandle = setInterval(() => {
      currentNow = Date.now();
      listeners.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };
}
const getNow = () => currentNow;

/**
 * Single 1Hz clock shared across all consumers. Prefer this over
 * component-local `setInterval` for live countdowns and relative-time
 * labels — one interval per app, one re-render per second per subscriber.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribeNow, getNow, getNow);
}

/* -------------------------------------------------------------------------- */
/*  Signed attachment URL renewal                                             */
/* -------------------------------------------------------------------------- */

/**
 * Attachments live in a private bucket and must be served via signed URLs.
 * We persist the storage path on the message (`metadata.media_path`) and
 * re-sign on demand so old messages don't lose their media when the initial
 * signed URL expires (default: 7 days).
 */
const urlCache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string>>();
const SIGN_TTL = 60 * 60 * 6; // 6 hours

async function signUrl(path: string): Promise<string> {
  const cached = urlCache.get(path);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  const existing = inflight.get(path);
  if (existing) return existing;
  const p = supabase.storage
    .from("attachments")
    .createSignedUrl(path, SIGN_TTL)
    .then(({ data, error }) => {
      inflight.delete(path);
      if (error || !data?.signedUrl) throw error ?? new Error("sign failed");
      urlCache.set(path, {
        url: data.signedUrl,
        expiresAt: Date.now() + (SIGN_TTL - 300) * 1000,
      });
      return data.signedUrl;
    });
  inflight.set(path, p);
  return p;
}

/**
 * Resolve the current display URL for an attachment. Falls back to the
 * `mediaUrl` embedded on the message if no storage path was persisted
 * (legacy rows written before this contract).
 */
export function useSignedAttachmentUrl(
  path: string | null | undefined,
  fallbackUrl: string | null | undefined,
): string | null {
  const [value, setValue] = useState<string | null>(fallbackUrl ?? null);

  useEffect(() => {
    setValue(fallbackUrl ?? null);
  }, [fallbackUrl]);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    signUrl(path)
      .then((url) => {
        if (!cancelled) setValue(url);
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return value;
}
