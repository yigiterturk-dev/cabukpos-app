"use client";

import { useState } from "react";
import Link from "next/link";
import { signupAction } from "@/lib/auth/actions";

export default function KayitPage() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signupAction({ businessName, email, password });
      if (res.ok) {
        // Tam yenileme: root layout yeni oturumla "db" modunda yeniden çalışsın.
        // Sektör henüz seçilmediği için onboarding (/) açılır → demo/boş seçim → /dashboard.
        window.location.href = "/";
      } else {
        setError(res.error);
        setLoading(false);
      }
    } catch {
      setError("Beklenmeyen bir hata oluştu.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="font-display text-[22px] font-700 tracking-tight text-brand"
          >
            Yanında POS
          </Link>
          <h1 className="mt-4 font-display text-[20px] font-700 text-ink">
            İşletmenizi oluşturun
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Randevu, müşteri ve prim yönetimi tek panelde.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-line bg-surface p-6 shadow-card"
        >
          {error && (
            <div className="mb-4 rounded-xl border border-rose/30 bg-rose/5 px-3.5 py-2.5 text-[13px] font-medium text-rose">
              {error}
            </div>
          )}

          <label className="block text-[13px] font-medium text-ink">İşletme adı</label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15"
            placeholder="Örn. Yıldız Güzellik"
          />

          <label className="mt-4 block text-[13px] font-medium text-ink">E-posta</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15"
            placeholder="ornek@isletme.com"
          />

          <label className="mt-4 block text-[13px] font-medium text-ink">Şifre</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15"
            placeholder="En az 8 karakter"
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60"
          >
            {loading ? "Oluşturuluyor…" : "Hesap oluştur"}
          </button>

          <p className="mt-4 text-center text-[13px] text-muted">
            Zaten hesabın var mı?{" "}
            <Link href="/giris" className="font-semibold text-brand hover:underline">
              Giriş yap
            </Link>
          </p>
        </form>

        <p className="mt-4 text-center text-[12.5px] text-muted">
          <Link href="/" className="hover:text-ink hover:underline">
            Demo&apos;yu dene (kayıtsız)
          </Link>
        </p>
      </div>
    </div>
  );
}
