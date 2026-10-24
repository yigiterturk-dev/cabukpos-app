"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseBrowserRegister } from "@/lib/kasa/setup-actions";
import { inspectRegisterSwitch } from "@/lib/offline/register-switch";
import { Button } from "@/components/ui";

export function BrowserRegisterSwitch({ deviceId, tenantName }: { deviceId: string; tenantName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return <div className="space-y-4">
    <h2 className="font-semibold">Bu tarayıcı farklı bir işletmenin kasasına bağlı</h2>
    <p className="break-words text-sm text-muted">Mevcut eşleme: {tenantName}. Bekleyen belge ve açık vardiya yoksa bu tarayıcıyı oturum açtığınız işletmeye geçirebilirsiniz. Diğer işletmenin cihaz kaydı ve satışları değiştirilmez.</p>
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    <Button type="button" disabled={pending} className="w-full" onClick={() => start(async () => {
      setError(null);
      try {
        const problem = await inspectRegisterSwitch();
        if (problem) { setError(problem); return; }
        const result = await releaseBrowserRegister(deviceId);
        if (result.error) { setError(result.error); return; }
        router.refresh();
      } catch { setError("Yerel kasa durumu kontrol edilemedi. Veri silinmedi; yeniden deneyin."); }
    })}>{pending ? "Kontrol ediliyor…" : "Bu tarayıcıyı mevcut işletmeye geçir"}</Button>
    <Link href="/kasa" className="block py-2 text-center text-sm text-brand underline">Önce mevcut kasayı aç</Link>
  </div>;
}
