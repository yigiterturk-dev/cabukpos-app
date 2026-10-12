import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Konuşarak Yönet · Doğal dille rapor ve stok | ÇabukPOS",
  description: "“Dün en çok ne sattım, kritik stok var mı, bugün ciro ne?” — işletmeni panelde aramadan, konuşarak yönet. Canlı deneyin.",
  openGraph: {
    title: "Konuşarak Yönet · ÇabukPOS",
    description: "Ciro, stok, en çok satan… sor, cevabı getirsin. Canlı demo.",
    type: "website",
  },
};

export default function KonusarakYonetLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
