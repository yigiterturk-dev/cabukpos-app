import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { indexable } from "@/lib/site";
import CtaAnalytics from "@/components/CtaAnalytics";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin", "latin-ext"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "ÇabukPOS",
  description: "Restoran ve market için satış noktası",
  robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const themeInit = `(function(){try{var t=localStorage.getItem("tema")||"acik";var d=t==="koyu"||(t!=="acik"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;
  return (
    <html lang="tr" className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full bg-canvas font-sans">
        <CtaAnalytics />
        {children}
      </body>
    </html>
  );
}
