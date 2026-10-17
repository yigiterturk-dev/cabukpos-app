import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Sipariş · Telefon ve WhatsApp ile sipariş | ÇabukPOS",
  description: "Örnek menüyle sipariş metnini ürünlere eşleyin ve demo mutfak fişini inceleyin.",
  openGraph: {
    title: "AI Sipariş · ÇabukPOS",
    description: "Örnek menüyle sipariş eşleştirme akışını deneyin. Demo verisi, telefon veya WhatsApp entegrasyonu yok.",
    type: "website",
  },
};

export default function AiSiparisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
