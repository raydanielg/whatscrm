/** Keep delayed read receipts from undoing a user's explicit "mark unread" action. */
const unreadUntil = new Map<string, number>();
const pendingReads = new Map<string, Set<Promise<unknown>>>();

export function holdManualUnread(conversationId: string) {
  unreadUntil.set(conversationId, Date.now() + 3_000);
}

export function clearManualUnreadHold(conversationId: string) {
  unreadUntil.delete(conversationId);
}

export function isManualUnreadHeld(conversationId: string): boolean {
  const until = unreadUntil.get(conversationId) ?? 0;
  if (until > Date.now()) return true;
  unreadUntil.delete(conversationId);
  return false;
}

export function trackReadWrite<T>(conversationId: string, write: Promise<T>): Promise<T> {
  const writes = pendingReads.get(conversationId) ?? new Set<Promise<unknown>>();
  writes.add(write);
  pendingReads.set(conversationId, writes);
  void write.then(
    () => {
      writes.delete(write);
      if (!writes.size) pendingReads.delete(conversationId);
    },
    () => {
      writes.delete(write);
      if (!writes.size) pendingReads.delete(conversationId);
    },
  );
  return write;
}

export async function waitForReadWrites(conversationId: string) {
  const writes = pendingReads.get(conversationId);
  if (writes?.size) await Promise.allSettled([...writes]);
}
