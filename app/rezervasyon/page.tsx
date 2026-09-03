"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { appOrigin } from "@/lib/public-url";
import { sectorTerms } from "@/lib/sectors";
import { IcCopy, IcLink, IcCheck } from "@/components/icons";

export default function RezervasyonPage() {
  const { state } = useStore();
  const terms = sectorTerms(state.sector);
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  const path = `/r/${state.bookingSlug}`;
  const fullUrl = origin ? origin + path : `${appOrigin()}${path}`;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!fullUrl) return;
    let cancelled = false;
    // toDataURL kullanılıyor, toString DEĞİL: `toString` adı Object.prototype.toString ile
    // çakışıyor ve paketleyicinin ESM/CJS interop'unda yanlış fonksiyona bağlanabiliyor —
    // QR sessizce hiç üretilmiyordu. toDataURL modülün kendi alanı, çakışma yok.
    // Hatalar artık YUTULMUYOR: sessiz catch yüzünden bu hata fark edilmemişti.
    import("qrcode")
      .then((mod) => {
        const qrcode = mod.default ?? mod;
        return qrcode.toDataURL(fullUrl, {
          margin: 1,
          width: 360,
          color: { dark: "#16181D", light: "#FFFFFF" },
        });
      })
      .then((dataUrl) => { if (!cancelled) setQr(dataUrl); })
      .catch((e) => { if (!cancelled) console.error("[rezervasyon] QR üretilemedi:", e); });
    return () => { cancelled = true; };
  }, [fullUrl]);

  function copy() {
    navigator.clipboard?.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Shell>
      <div className="mx-auto max-w-[1000px]">
        <SectionTitle sub={`Müşterileriniz bu linkten kendi ${terms.appointment.toLowerCase()}sunu oluştursun`}>
          Online Rezervasyon
        </SectionTitle>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <IcLink className="h-4.5 w-4.5 text-brand" /> Rezervasyon linkiniz
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-canvas px-3.5 py-3">
              <span className="flex-1 truncate text-[14px] font-medium text-ink">{fullUrl}</span>
              <button onClick={copy} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-deep">
                {copied ? <><IcCheck className="h-3.5 w-3.5" /> Kopyalandı</> : <><IcCopy className="h-3.5 w-3.5" /> Kopyala</>}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={path} target="_blank" className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand">
                Sayfayı önizle →
              </Link>
              <a href={`https://wa.me/?text=${encodeURIComponent(`${state.businessName} randevu: ${fullUrl}`)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand">
                WhatsApp ile paylaş
              </a>
            </div>

            <div className="mt-6 space-y-3 border-t border-line pt-5">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Nasıl çalışır?</div>
              {[
                "Müşteri linke veya QR'a tıklar",
                `${terms.service}, ${terms.staff.toLowerCase()} ve müsait saati seçer`,
                "Randevu anında panelinize ve takvime düşer",
              ].map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-[13.5px] text-ink">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">{i + 1}</span>
                  {t}
                </div>
              ))}
            </div>
          </Card>

          {/* QR */}
          <Card className="flex flex-col items-center justify-center p-5">
            <div className="text-[13px] font-semibold text-ink">QR Kod</div>
            <div className="mt-3 rounded-2xl border border-line bg-white p-3 shadow-card">
              {qr ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={qr} alt="Rezervasyon sayfası QR kodu" width={180} height={180} className="h-[180px] w-[180px]" />
              ) : (
                <div className="h-[180px] w-[180px] animate-pulse rounded bg-canvas" />
              )}
            </div>
            <p className="mt-3 max-w-[220px] text-center text-[12px] text-muted">
              İşletmenize asın; müşteriler okutarak hemen randevu alsın.
            </p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
