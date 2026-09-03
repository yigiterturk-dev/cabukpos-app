import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { StoreProvider, type AppMode } from "@/lib/store";
import { getLiveSession } from "@/lib/auth/session";
import { loadBusinessState } from "@/lib/data";
import type { BusinessState } from "@/lib/types";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yanında POS — İşletme Yönetimi",
  description:
    "Randevu, müşteri, personel ve prim yönetimi tek panelde. Berber, güzellik, oto yıkama, veteriner, diyetisyen, psikolog, doktor ve diş hekimi için komisyonsuz işletme suite'i.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mod tespiti server'da: canlı oturum varsa "db" (state'i SSR'da yükle), yoksa "demo".
  //
  // getLiveSession TEK KEZ çağrılır. Önce getMode() sonra getLiveSession() çağırmak
  // aynı canlılık sorgusunu iki kez atıyordu — her sayfa yüklemesinde boşuna bir
  // veritabanı turu. Mod zaten oturumun kendisinden türetilebiliyor.
  const session = await getLiveSession();
  let storeMode: AppMode = "demo";
  let initialState: BusinessState | null = null;
  let initialBusinessName = "";

  if (session?.businessId) {
    storeMode = "db";
    // businessId ASLA client'tan gelmez — oturumdan türetilir.
    initialState = await loadBusinessState(session.businessId);
    initialBusinessName = initialState?.businessName ?? "";
  }

  return (
    <html lang="tr" className={`${inter.variable} ${sora.variable}`}>
      <body className="font-sans antialiased">
        <StoreProvider
          initialMode={storeMode}
          initialState={initialState}
          initialBusinessName={initialBusinessName}
        >
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
