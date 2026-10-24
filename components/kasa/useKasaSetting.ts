"use client";
import { useCallback, useSyncExternalStore } from "react";

const EVENT = "cabukpos:kasa-setting";
const memory = new Map<string, string>();
/** Preferences survive reloads; blocked storage falls back to this tab's memory. */
export function useKasaSetting(key: string, allowed: readonly string[], fallback: string) {
  const subscribe = useCallback((notify: () => void) => {
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) { memory.delete(key); notify(); } };
    window.addEventListener("storage", storage); window.addEventListener(EVENT, notify);
    return () => { window.removeEventListener("storage", storage); window.removeEventListener(EVENT, notify); };
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => {
    let stored: string | null | undefined = memory.get(key);
    if (stored && allowed.includes(stored)) return stored;
    try { stored = localStorage.getItem(key); } catch { stored = memory.get(key); }
    return stored && allowed.includes(stored) ? stored : fallback;
  }, () => fallback);
  const set = (next: string) => {
    if (!allowed.includes(next)) return;
    try { localStorage.setItem(key, next); memory.delete(key); } catch { memory.set(key, next); }
    window.dispatchEvent(new Event(EVENT));
  };
  return [value, set] as const;
}
