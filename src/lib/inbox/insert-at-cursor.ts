/**
 * Pure helper for inserting text into a composer draft at the current caret
 * (or selection) position, used by the quick-reply picker and other
 * insert-into-composer affordances.
 */
export function insertAtCursor(
  current: string,
  selectionStart: number,
  selectionEnd: number,
  insertText: string,
): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart, current.length));
  const end = Math.max(start, Math.min(selectionEnd, current.length));
  const before = current.slice(0, start);
  const after = current.slice(end);
  // Add a separating space when inserting next to existing non-whitespace text.
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
  const insert = `${needsLeadingSpace ? " " : ""}${insertText}${needsTrailingSpace ? " " : ""}`;
  const text = `${before}${insert}${after}`;
  return { text, cursor: before.length + insert.length };
}
