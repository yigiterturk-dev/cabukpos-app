import { redirect } from "next/navigation";
import { getDevice } from "@/lib/auth/kasa";
import { PairForm } from "@/components/kasa/KasaForms";

export const dynamic = "force-dynamic";

export default async function Eslestir() {
  if (await getDevice()) redirect("/kasa");
  return (
    <main className="grid flex-1 place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-sm font-semibold uppercase tracking-widest text-brand">ÇabukPOS</div>
        <h1 className="mb-6 mt-2 text-2xl font-semibold tracking-tight">Bu cihazı kasaya eşle</h1>
        <PairForm />
      </div>
    </main>
  );
}
