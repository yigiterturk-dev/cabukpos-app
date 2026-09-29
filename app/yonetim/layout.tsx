import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { bannerText } from "@/lib/core/billing";
import { logout } from "@/lib/auth/actions";
import { Nav } from "./Nav";

export default async function YonetimLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr] print:block">
      <aside className="border-b border-line p-4 print:hidden md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="mb-1 hidden px-3 text-sm font-semibold uppercase tracking-widest text-brand md:block">ÇabukPOS</div>
        <div className="mb-6 hidden px-3 text-sm text-muted md:block">{a.tenantName} · {a.vertical === "restoran" ? "Restoran" : "Market"}</div>
        <Nav vertical={a.vertical} />
        <div className="mt-3 flex items-center gap-3 border-t border-line px-3 pt-3 text-sm md:mt-6 md:block md:pt-4">
          <div className="font-medium">{a.name}</div>
          <form action={logout} className="ml-auto md:ml-0">
            <button className="text-xs text-muted underline hover:text-ink md:mt-2">Çıkış</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8 print:max-w-none print:p-0">
        {a.billing.warn && (
          <div data-testid="billing-banner" className={`mb-6 rounded-lg border p-3 text-sm print:hidden ${a.billing.locked ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            {bannerText(a.billing)} <Link href="/yonetim/abonelik" className="font-medium underline">Abonelik</Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
