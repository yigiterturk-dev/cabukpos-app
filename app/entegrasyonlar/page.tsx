"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { integrationStatusAction, saveCredentialAction, sendTestOrderAction } from "@/lib/integrations/actions";
import { PLATFORM_LABEL, PLATFORMS, type PlatformId } from "@/lib/integrations/types";
import { IcLink, IcCheck } from "@/components/icons";

interface Status {
  platforms: { id: PlatformId; enabled: boolean; branchRef: string | null }[];
  recent: { id: string; platform: string; status: string; createdAt: string; error: string | null }[];
}

const inputCls =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition focus:border-brand/40";

export default function EntegrasyonlarPage() {
  const { state } = useStore();
  const [status, setStatus] = useState<Status | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [branchRefs, setBranchRefs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ platform: string; ok: boolean; message: string } | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(() => {
    integrationStatusAction()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  async function save(platform: PlatformId, enabled: boolean) {
    setSaving(platform);
    try {
      await saveCredentialAction({
        platform,
        secret: secrets[platform] ?? "",
        branchRef: branchRefs[platform],
        enabled,
      });
      setFlash({ platform, ok: true, message: enabled ? "Etkinleştirildi." : "Kaydedildi (kapalı)." });
      void load();
    } catch (e) {
      setFlash({ platform, ok: false, message: e instanceof Error ? e.message : "Kaydedilemedi." });
    } finally {
      setSaving(null);
    }
  }

  async function sendTest(platform: PlatformId) {
    setTesting(platform);
    try {
      const r = await sendTestOrderAction(platform);
      setFlash({
        platform,
        ok: r.ok,
        message: r.ok ? `${r.message} ${r.matched?.join(", ") ?? ""}` : r.message,
      });
      void load();
    } catch (e) {
      setFlash({ platform, ok: false, message: e instanceof Error ? e.message : "Hata." });
    } finally {
      setTesting(null);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-[1000px]">
        <SectionTitle sub="Trendyol Go / Uber Eats ve Yemeksepeti siparişleri doğrudan kasaya düşer">
          Entegrasyonlar
        </SectionTitle>

        <p className="mt-4 rounded-xl bg-amber/10 px-4 py-3 text-[13px] leading-relaxed text-ink">
          <strong>Önemli:</strong> Platform siparişleri ancak <strong>integratör onayından</strong> sonra
          canlı akar. Onaya kadar webhook adresini buradan alıp başvuruda iletebilirsin; onay gelince
          secret&apos;ı girip etkinleştirmen yeterli. Başvuru adımları için{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 text-[12px]">docs/entegrasyon-basvuru.md</code>.
        </p>

        <div className="mt-5 space-y-4">
          {PLATFORMS.map((p) => {
            const st = status?.platforms.find((x) => x.id === p);
            return (
              <Card key={p} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-[17px] font-bold text-ink">{PLATFORM_LABEL[p]}</h3>
                    <p className="mt-1 text-[12.5px] text-muted">
                      Webhook:{" "}
                      <code className="rounded bg-canvas px-1.5 py-0.5 text-[12px]">
                        {origin || "https://…"}/api/integrations/{p}
                      </code>
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
                      st?.enabled ? "bg-brand-soft text-brand-deep" : "bg-canvas text-muted ring-1 ring-line"
                    }`}
                  >
                    {st?.enabled ? "Etkin" : "Bağlı değil"}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[12px] font-semibold text-muted">
                      Webhook secret (x-api-key)
                    </label>
                    <input
                      type="password"
                      className={inputCls}
                      placeholder="Platform panelinden aldığın anahtar"
                      value={secrets[p] ?? ""}
                      onChange={(e) => setSecrets((s) => ({ ...s, [p]: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-semibold text-muted">
                      Şube / restoran kimliği (isteğe bağlı)
                    </label>
                    <input
                      className={inputCls}
                      placeholder="Örn. 123456"
                      value={branchRefs[p] ?? ""}
                      onChange={(e) => setBranchRefs((s) => ({ ...s, [p]: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => void save(p, true)}
                    disabled={saving === p || (secrets[p] ?? "").trim().length < 8}
                    className="rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-card transition hover:bg-brand-deep disabled:opacity-40"
                  >
                    {saving === p ? "Kaydediliyor…" : "Kaydet & Etkinleştir"}
                  </button>
                  {st?.enabled && (
                    <button
                      onClick={() => void save(p, false)}
                      disabled={saving === p}
                      className="rounded-xl bg-canvas px-4 py-2.5 text-[13.5px] font-semibold text-ink ring-1 ring-line transition hover:ring-rose/40"
                    >
                      Kapat
                    </button>
                  )}
                  <button
                    onClick={() => void sendTest(p)}
                    disabled={testing === p}
                    className="rounded-xl bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink ring-1 ring-line transition hover:ring-brand/40 disabled:opacity-40"
                  >
                    {testing === p ? "Gönderiliyor…" : "Test siparişi gönder"}
                  </button>
                  {flash?.platform === p && (
                    <span className={`text-[12.5px] font-semibold ${flash.ok ? "text-brand" : "text-rose"}`}>
                      {flash.ok ? "✓ " : "✗ "}
                      {flash.message}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Son gelen siparişler */}
        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <h3 className="text-[14px] font-bold text-ink">Son gelen platform siparişleri</h3>
          </div>
          {!status || status.recent.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-muted">
              Henüz platform siparişi gelmedi — &quot;Test siparişi&quot; ile hattı deneyebilirsin.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {status.recent.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                  <div className="min-w-0">
                    <span className="font-semibold text-ink">{PLATFORM_LABEL[o.platform as PlatformId] ?? o.platform}</span>
                    <span className="ml-2 text-muted">
                      {new Date(o.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    {o.error && <p className="mt-0.5 text-[12px] text-rose">{o.error}</p>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      o.status === "mapped"
                        ? "bg-brand-soft text-brand-deep"
                        : o.status === "failed"
                          ? "bg-rose/10 text-rose"
                          : "bg-canvas text-muted"
                    }`}
                  >
                    {o.status === "mapped" ? "işlendi" : o.status === "failed" ? "hata" : o.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}
