"use client";
// Örnek menü yükleme düğmesi: yalnız ürün listesi boşken gösterilir; yükleme sonrası sayfa tazelenir.
import { useActionState } from "react";
import { ShoppingBasket } from "lucide-react";
import { ornekMenuYukle } from "@/lib/admin/sample-menu";

type State = { ok: boolean; error?: string };

export function OrnekMenuButton({ className = "" }: { className?: string }) {
  const [state, dispatch, pending] = useActionState(async () => {
    const r = await ornekMenuYukle();
    return r;
  }, {} as State);
  return (
    <form action={dispatch} aria-busy={pending} className="inline-flex flex-col items-start gap-1">
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className={className || "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-medium text-brand outline-none hover:bg-brand-soft hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60"}
      >
        <ShoppingBasket aria-hidden className="size-4" />{pending ? "Örnek menü yükleniyor…" : "Boş başlamak istemiyorum — örnek menüyü yükle"}
      </button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Örnek menü yükleniyor, kategoriler ve ürünler ekleniyor.</span>}
      {state.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
    </form>
  );
}
