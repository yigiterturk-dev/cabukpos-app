import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Konuşarak Yönet · Doğal dille rapor ve stok | ÇabukPOS",
  description: "Örnek satış ve stok verilerine doğal dille soru soran konuşarak yönet demo akışı.",
  openGraph: {
    title: "Konuşarak Yönet · ÇabukPOS",
    description: "Demo satış ve stok verilerine örnek sorular sor. Gerçek işletme verisi kullanılmaz.",
    type: "website",
  },
};

export default function KonusarakYonetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
