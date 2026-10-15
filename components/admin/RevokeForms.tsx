"use client";
// #8: yıkıcı aksiyon (iptal) formu — tekrar kimlik doğrulama (şifre) ister.
import { useActionState } from "react";
import { PasswordInput } from "@/components/PasswordInput";

export function RevokeForm({ action, label = "İptal et" }: { action: (s: { error?: string }, f: FormData) => Promise<{ error?: string }>; label?: string }) {
  const [state, dispatch, pending] = useActionState(action, {} as { error?: string });
  return (
    <form action={dispatch} className="flex flex-wrap items-center justify-end gap-2">
      <PasswordInput name="sifre" required autoComplete="current-password" placeholder="Şifreniz" aria-label="Şifreniz" className="min-h-11 w-32 px-2 text-xs" />
      <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-sm text-bad outline-none hover:bg-bad-soft hover:underline focus-visible:ring-4 focus-visible:ring-bad/20 disabled:opacity-40">{pending ? "İşleniyor…" : label}</button>
      {state.error && <span className="max-w-full break-words text-xs text-bad" role="alert" aria-live="assertive">{state.error}</span>}
    </form>
  );
}
