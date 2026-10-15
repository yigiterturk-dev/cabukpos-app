"use client";
import { useFormAction } from "@/components/useFormAction";
import { setLang, type LangState } from "@/lib/admin/lang-actions";
import { LANGS, type Lang } from "@/lib/core/i18n";

const LABEL: Record<Lang, string> = { tr: "Türkçe", en: "English" };
const btn = (on: boolean) => `min-h-11 rounded-lg border px-4 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:bg-surface-2"}`;

/** #45: panel dili seçimi — sunucu eylemi çerezi yazar, layout yeniden çizilir. */
export function LangSecimi({ lang }: { lang: Lang }) {
  const { state, pending, onSubmit } = useFormAction(setLang, {} as LangState);
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2" role="group" aria-label="Dil / Language">
      {LANGS.map((l) => (
        <button key={l} type="submit" name="lang" value={l} aria-pressed={l === lang} disabled={pending} className={btn(l === lang)}>{LABEL[l]}</button>
      ))}
      {state.error && <span className="max-w-full break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</span>}
    </form>
  );
}
