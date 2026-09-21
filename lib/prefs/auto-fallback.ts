"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether UNBOUND may switch models automatically when the chosen one fails
 * before answering. Stored per browser; sent with every generation request
 * and enforced server-side (the server never assumes — it reads the flag).
 */

const KEY = "unbound:auto-fallback";
const listeners = new Set<() => void>();

export function getAutoFallback(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutoFallback(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "off");
  } catch {
    // ignore — falls back to the default (on)
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAutoFallback(): [boolean, (enabled: boolean) => void] {
  const value = useSyncExternalStore(subscribe, getAutoFallback, () => true);
  return [value, setAutoFallback];
}
