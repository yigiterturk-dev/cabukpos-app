"use client";
// #8: yıkıcı aksiyon (iptal) formu — tekrar kimlik doğrulama (şifre) ister.
import { useActionState } from "react";

export function RevokeForm({ action, label = "İptal et" }: { action: (s: { error?: string }, f: FormData) => Promise<{ error?: string }>; label?: string }) {
  const [state, dispatch, pending] = useActionState(action, {} as { error?: string });
  return (
    <form action={dispatch} className="flex flex-wrap items-center justify-end gap-2">
      <input type="password" name="sifre" required autoComplete="current-password" placeholder="Şifreniz" aria-label="Şifreniz" className="h-8 w-32 rounded-lg border border-line bg-surface px-2 text-xs" />
      <button disabled={pending} className="text-sm text-bad hover:underline disabled:opacity-40">{label}</button>
      {state.error && <span className="text-xs text-bad" role="alert">{state.error}</span>}
    </form>
  );
}
