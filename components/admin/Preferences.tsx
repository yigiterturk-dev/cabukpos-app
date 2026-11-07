"use client";
// #46: tema + kasa ses tercihi. localStorage: "tema" (acik|koyu|sistem), "sesli_uyari" (kapali|acik).
// useSyncExternalStore ile okunur (SSR güvenli, sekme içi değişimde render).
import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui";

export type Tema = "acik" | "koyu" | "sistem";
const TEMA_LABEL: Record<Tema, string> = { acik: "Açık", koyu: "Koyu", sistem: "Sistem" };
const SES_KEY = "sesli_uyari";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const subscribeTheme = (fn: () => void) => {
  listeners.add(fn);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => { if (getTema() === "sistem") apply("sistem"); fn(); };
  media.addEventListener("change", onChange);
  return () => { listeners.delete(fn); media.removeEventListener("change", onChange); };
};
const emit = () => listeners.forEach((l) => l());

const apply = (t: Tema) => {
  const dark = t === "koyu" || (t !== "acik" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
};

export const getTema = (): Tema => { try { return ((localStorage.getItem("tema") as Tema) || "acik"); } catch { return "acik"; } };
const getServerTema = (): Tema => "acik";
export const getSesKapali = (): boolean => { try { return localStorage.getItem(SES_KEY) === "kapali"; } catch { return false; } };
const getServerSesKapali = () => false;

export function useTema(): [Tema, (t: Tema) => void] {
  const tema = useSyncExternalStore(subscribeTheme, getTema, getServerTema);
  return [tema, (t) => { try { localStorage.setItem("tema", t); } catch { /* yok say */ } apply(t); emit(); }];
}

export function useSesKapali(): [boolean, (v: boolean) => void] {
  const kapali = useSyncExternalStore(subscribe, getSesKapali, getServerSesKapali);
  return [kapali, (v) => { try { localStorage.setItem(SES_KEY, v ? "kapali" : "acik"); } catch { /* yok say */ } emit(); }];
}

const temaBtn = (on: boolean) => `inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-4 py-2 text-sm outline-none transition focus-within:ring-4 focus-within:ring-brand-ring/60 ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`;

/** Yönetim başlığındaki küçük döngü: açık → koyu → sistem. */
export function ThemeToggle() {
  const [tema, setTemaState] = useTema();
  const next: Tema = tema === "acik" ? "koyu" : tema === "koyu" ? "sistem" : "acik";
  const Icon = tema === "koyu" ? Moon : tema === "acik" ? Sun : Monitor;
  return (
    <button type="button" onClick={() => setTemaState(next)} title={`Tema: ${TEMA_LABEL[tema]}`} aria-label={`Tema: ${TEMA_LABEL[tema]}`}
      className="press inline-flex size-11 items-center justify-center rounded-lg border border-line text-muted outline-none hover:text-ink hover:border-line-strong focus-visible:ring-4 focus-visible:ring-brand-ring/60">
      <Icon aria-hidden className="size-4" />
    </button>
  );
}

export function SesToggle() {
  const [kapali, setKapaliState] = useSesKapali();
  return (
    <Button type="button" aria-pressed={kapali} variant={kapali ? "secondary" : "primary"} onClick={() => setKapaliState(!kapali)}>
      {kapali ? <VolumeX aria-hidden className="size-4" /> : <Volume2 aria-hidden className="size-4" />}{kapali ? "Uyarı sesi kapalı" : "Uyarı sesi açık"}
    </Button>
  );
}

export function TemaSecimi() {
  const [tema, setTemaState] = useTema();
  return (
    <fieldset className="m-0 flex gap-2 border-0 p-0">
      <legend className="sr-only">Tema</legend>
      {(Object.keys(TEMA_LABEL) as Tema[]).map((t) => (
        <label key={t} className={temaBtn(tema === t)}>
          <input type="radio" name="tema" value={t} checked={tema === t} onChange={() => setTemaState(t)} className="peer sr-only" />
          {TEMA_LABEL[t]}
        </label>
      ))}
    </fieldset>
  );
}
