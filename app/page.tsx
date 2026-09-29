import Link from "next/link";
import { LegalFooter } from "@/components/Legal";

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-sm font-semibold uppercase tracking-widest text-brand">ÇabukPOS</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Restoran ve market için satış noktası</h1>
        <div className="mt-8 grid gap-3">
          <Link href="/kasa" className="rounded-lg bg-brand px-4 py-3 font-medium text-white">Kasayı aç</Link>
          <Link href="/giris" className="rounded-lg border border-line px-4 py-3 font-medium hover:bg-stone-50">Yönetim girişi</Link>
          <Link href="/kayit" className="text-sm text-muted underline">İşletme hesabı aç</Link>
        </div>
        <LegalFooter className="mt-12" />
      </div>
    </main>
  );
}
