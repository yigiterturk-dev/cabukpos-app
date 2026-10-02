import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kasa · ÇabukPOS" };

export default function KasaLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-canvas">{children}</div>;
}
