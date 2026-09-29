import Link from "next/link";
import { LegalFooter } from "@/components/Legal";
import { LogoMark } from "@/components/ui";
import { LEGAL_UPDATED, sellerReady } from "@/lib/legal";

export default function YasalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight"><LogoMark size="sm" />ÇabukPOS</Link>
      {!sellerReady() && <p className="mt-4 rounded-[10px] bg-warn-soft px-3 py-2 text-sm text-warn">Satıcı şirket bilgileri kuruluş tamamlanınca eklenecek.</p>}
      <article className="legal mt-6 space-y-4 text-[15px] leading-relaxed text-ink-2">{children}</article>
      <p className="mt-8 text-xs text-muted">Son güncelleme: {LEGAL_UPDATED}</p>
      <LegalFooter className="mt-6 border-t border-line pt-6" />
    </main>
  );
}
