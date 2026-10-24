import { kasaDb } from "./db";

export function registerSwitchProblem(state: { pending: number; rejected: number; openShift: boolean }): string | null {
  if (state.pending > 0) return `${state.pending} bekleyen kasa belgesi var. Önce mevcut kasayı açıp eşitleyin.`;
  if (state.rejected > 0) return `${state.rejected} incelenecek kasa belgesi var. Önce mevcut kasada çözün.`;
  if (state.openShift) return "Mevcut kasanın vardiyası açık. İşletme değiştirmeden önce gün sonunu kapatın ve eşitleyin.";
  return null;
}

/** Read-only: cached sales/documents are never deleted by switching UI. */
export async function inspectRegisterSwitch(targetDeviceId: string | null = null): Promise<string | null> {
  const db = kasaDb();
  return db.transaction("r", [db.meta, db.outbox, db.rejected], async () => {
    const meta = await db.meta.get("state");
    if (targetDeviceId && meta?.device?.id === targetDeviceId) return null;
    return registerSwitchProblem({ pending: await db.outbox.count(), rejected: await db.rejected.count(), openShift: Boolean(meta?.shift) });
  });
}
