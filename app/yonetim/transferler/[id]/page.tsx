import Link from "next/link";
import { notFound } from "next/navigation";
import { withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { transferDocument } from "@/lib/admin/transfer-document";
import { transferDate, transferQuantity } from "@/lib/core/transfer-document";
import { PrintButton } from "@/components/PrintButton";
import { buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stok transferi — ÇabukPOS" };

export default async function TransferDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  const { id } = await params;
  const doc = await withTenant(actor.tenantId, (tx) => transferDocument(tx, actor, id));
  if (!doc) notFound();
  return (
    <article aria-label="Transfer dökümü" className="print-paper mx-auto max-w-3xl rounded-2xl border border-line bg-white p-5 text-ink sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0">
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/yonetim/transferler" className="mr-auto text-sm text-brand underline">← Transferler</Link>
        <Link href={`/yonetim/transferler/${doc.id}/csv`} prefetch={false} className={buttonClass("secondary")}>CSV indir</Link>
        <PrintButton />
      </div>
      <header className="mb-6 space-y-2 border-b border-line pb-5">
        <p className="text-sm font-medium text-muted">{actor.tenantName}</p>
        <h1 className="text-2xl font-semibold">Stok transferi</h1>
        <p className="break-all font-mono text-xs text-muted">Transfer kimliği: {doc.id}</p>
        <time dateTime={doc.createdAt.toISOString()} className="block text-sm text-muted">{transferDate(doc.createdAt)} · İstanbul</time>
      </header>
      <dl className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
        <div className="min-w-0"><dt className="text-xs uppercase tracking-wide text-muted">Kaynak</dt><dd className="mt-1 break-words font-medium">{doc.fromName}</dd></div>
        <div className="min-w-0"><dt className="text-xs uppercase tracking-wide text-muted">Hedef</dt><dd className="mt-1 break-words font-medium">{doc.toName}</dd></div>
      </dl>
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">Transfer edilen ürünler</caption>
        <thead><tr className="border-b border-line text-left text-muted"><th scope="col" className="py-3 pr-3 font-medium">Ürün</th><th scope="col" className="w-32 py-3 text-right font-medium">Miktar</th></tr></thead>
        <tbody>{doc.lines.map((line) => <tr key={line.productId} className="break-inside-avoid border-b border-line"><th scope="row" className="break-words py-3 pr-3 text-left font-normal">{line.name}</th><td className="py-3 text-right tabular">{transferQuantity(line.qtyMilli, line.unit)}</td></tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs text-muted">{doc.lines.length} ürün kalemi</p>
      {doc.note && <section aria-label="Transfer notu" className="mt-6"><h2 className="mb-1 text-sm font-medium">Not</h2><p className="whitespace-pre-wrap break-words text-sm text-ink-2">{doc.note}</p></section>}
      <div className="mt-12 grid break-inside-avoid grid-cols-2 gap-8 text-sm text-muted">
        <div className="border-t border-line pt-3">Gönderen · Ad / İmza</div>
        <div className="border-t border-line pt-3">Teslim alan · Ad / İmza</div>
      </div>
    </article>
  );
}
