import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Sipariş · Telefon ve WhatsApp ile sipariş | ÇabukPOS",
  description: "Müşteri doğal dille söyler; yapay zekâ siparişi ürünlere çevirip kasaya ve mutfağa düşürür. Kayıt olmadan canlı deneyin.",
  openGraph: {
    title: "AI Sipariş · ÇabukPOS",
    description: "Telefon/WhatsApp siparişini yapay zekâ alır, mutfağa düşürür. Canlı demo.",
    type: "website",
  },
};

export default function AiSiparisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
