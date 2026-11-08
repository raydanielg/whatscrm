/**
 * Operator preference: auto-convert named placeholders ({{name}}) into Meta's
 * numbered placeholders ({{1}}, {{2}}, ) the moment an imported template is
 * opened in the editor, instead of surfacing the converter banner every time.
 *
 * Stored per browser (localStorage). Client-safe: guards for SSR.
 */

const STORAGE_KEY = "wacrm.wa.template.auto-convert-on-import";

/** Default is off: conversion stays explicit until the operator opts in. */
export function getAutoConvertOnImport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoConvertOnImport(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* storage disabled — preference simply does not persist */
  }
}
