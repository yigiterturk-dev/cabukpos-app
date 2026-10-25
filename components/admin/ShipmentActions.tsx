"use client";
import { useFormAction } from "@/components/useFormAction";
import { shipmentAction, type TransferState } from "@/lib/admin/transfer-actions";
import { Button } from "@/components/ui";
export function ShipmentActions({ id, status, canSend, canReceive }: { id: string; status: string; canSend: boolean; canReceive: boolean }) {
  const { state, pending, onSubmit } = useFormAction(shipmentAction, {} as TransferState);
  if (["teslim", "iptal"].includes(status)) return null;
  return <form onSubmit={onSubmit} className="my-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-4 print:hidden"><input type="hidden" name="id" value={id} />{canSend && status === "gonderildi" && <Button name="status" value="yolda" type="submit" variant="secondary" disabled={pending}>Yola çıktı</Button>}{canReceive && <Button name="status" value="teslim" type="submit" disabled={pending}>Teslim aldım · stoğa işle</Button>}{canSend && <Button name="status" value="iptal" type="submit" variant="ghost" disabled={pending}>Sevkiyatı iptal et</Button>}{state.error && !pending && <p role="alert" className="basis-full text-sm text-bad">{state.error}</p>}{pending && <p role="status" className="text-sm">İşleniyor…</p>}<p className="basis-full text-xs text-muted">Kaynak stok gönderimde düşer. Hedef stok teslim alma onayında artar. İptal edilirse stok kaynağa geri döner.</p></form>;
}
