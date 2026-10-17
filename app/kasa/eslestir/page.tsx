import { redirect } from "next/navigation";
import { getDevice } from "@/lib/auth/kasa";
import { PairForm } from "@/components/kasa/KasaForms";
import { Card, LogoMark } from "@/components/ui";
import { SkipToContent } from "@/components/SkipToContent";

export const dynamic = "force-dynamic";

export default async function Eslestir() {
  if (await getDevice()) redirect("/kasa");
  return (
    <main id="main-content" tabIndex={-1} className="grid min-h-dvh place-items-center px-4 py-8 outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">
      <SkipToContent />
      <div className="w-full max-w-sm">
        <LogoMark size="lg" className="mx-auto" />
        <div className="mt-4 text-center text-sm font-semibold uppercase tracking-widest text-brand">ÇabukPOS</div>
        <h1 className="mt-1 rounded-sm text-center text-2xl font-semibold tracking-tight">Bu cihazı kasaya eşle</h1>
        <Card className="mt-6 p-6"><PairForm /></Card>
      </div>
    </main>
  );
}
