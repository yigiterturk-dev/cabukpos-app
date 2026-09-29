import { LegalFooter } from "@/components/Legal";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-sm font-semibold uppercase tracking-widest text-brand">ÇabukPOS</div>
        {children}
        <LegalFooter className="mt-10" />
      </div>
    </main>
  );
}
