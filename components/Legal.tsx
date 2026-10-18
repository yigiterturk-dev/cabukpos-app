import Link from "next/link";
import { LEGAL_PAGES, SELLER_MISSING, seller } from "@/lib/legal";

export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Yasal" className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted ${className}`}>
      {LEGAL_PAGES.map((p) => <Link key={p.href} href={p.href} className="inline-flex min-h-11 items-center rounded px-1 outline-none hover:underline focus-visible:ring-4 focus-visible:ring-brand-ring/60">{p.label}</Link>)}
    </nav>
  );
}

/** Satıcı kimlik bloğu (tüm metinlerde aynı). */
export function SellerBlock() {
  const s = seller(), m = (x: string | null) => x ?? SELLER_MISSING;
  return (
    <ul className="list-none space-y-0.5 pl-0">
      <li><b>Unvan:</b> {m(s.name)}</li>
      <li><b>Adres:</b> {m(s.address)}</li>
      <li><b>Vergi dairesi / no:</b> {m(s.taxOffice)} / {m(s.taxId)}</li>
      {s.mersis && <li><b>MERSİS:</b> {s.mersis}</li>}
      <li><b>E-posta:</b> {m(s.email)}</li>
      {s.phone && <li><b>Telefon:</b> {s.phone}</li>}
      {s.kep && <li><b>KEP:</b> {s.kep}</li>}
    </ul>
  );
}
