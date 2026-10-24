"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PLATFORM_NAMES } from "@/lib/core/platform";
import type { Meta } from "@/lib/offline/state";

export function DeliveryConnections({ meta, preview }: { meta: Meta; preview: boolean }) {
  const [data, setData] = useState<{ connections: { platform: string; active: boolean; autoAccept: boolean }[]; error?: string } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (preview || !open) return;
    const controller = new AbortController();
    fetch("/api/delivery/connections", { cache: "no-store", signal: controller.signal }).then(async res => { if (!res.ok) throw new Error(); const body = await res.json(); if (!controller.signal.aborted) setData(body); }).catch(() => { if (!controller.signal.aborted) setData({ connections: [], error: "Bağlantı ayarları okunamadı." }); });
    return () => controller.abort();
  }, [preview, open]);
  return <section className="mb-4 rounded-xl border border-line bg-surface text-sm">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left font-medium outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60"><span>Platform ve yazdırma ayarları</span><span className="text-xs text-muted">{open ? "Gizle ↑" : "Göster ↓"}</span></button>
    {open && <div className="space-y-3 border-t border-line p-4"><p className="text-xs text-muted">Buradaki durumlar kayıtlı ayarlardır. Platforma canlı bağlantının sağlıklı olduğunu göstermez.</p>
      {preview ? <p className="text-muted">Önizleme platformlara bağlanmaz.</p> : data?.error ? <p role="alert" className="text-warn">{data.error}</p> : !data ? <p role="status">Ayarlar yükleniyor…</p> : <div className="flex flex-wrap gap-2">{data.connections.map(c => <div key={c.platform} className="rounded-lg border border-line bg-surface-2 px-3 py-2"><strong className="block text-xs">{PLATFORM_NAMES[c.platform] ?? c.platform}</strong><span className="text-xs text-muted">{c.active ? "Etkin" : "Kapalı"} · otomatik kabul {c.autoAccept && c.active ? "açık" : "kapalı"}</span></div>)}{!data.connections.length && <p className="text-muted">Bu şubeye platform bağlantısı tanımlanmamış.</p>}</div>}
      <p className="text-xs text-muted">{meta.agent ? `Yazıcı ajanı tanımlı · otomatik fiş ${meta.agent.autoPrint ? "açık" : "kapalı"}` : "Yazıcı ajanı tanımlanmamış · tarayıcıdan yazdırma kullanılabilir"}</p>
      <Link href="/yonetim/platformlar" className="inline-flex min-h-11 items-center font-medium text-brand underline">Platform bağlantılarını yönet →</Link>
    </div>}
  </section>;
}
