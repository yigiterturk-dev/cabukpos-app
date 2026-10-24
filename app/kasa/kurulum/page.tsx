import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDevice } from "@/lib/auth/kasa";
import { canManageUsers } from "@/lib/core/access";
import { RegisterSetupForm } from "@/components/kasa/RegisterSetupForm";
import { BrowserRegisterSwitch } from "@/components/kasa/BrowserRegisterSwitch";
import { Card, LogoMark } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RegisterSetup() {
  const admin = await requireAdmin();
  if (!canManageUsers(admin)) redirect("/yonetim/cihazlar");
  const device = await getDevice();
  const conflict = Boolean(device && device.tenantId !== admin.tenantId);
  return <main id="main-content" tabIndex={-1} className="mx-auto min-h-dvh w-full max-w-lg px-4 py-8 outline-none">
    <div className="mb-5 flex items-center justify-center gap-3"><LogoMark /><span className="font-semibold">ÇabukPOS</span></div>
    <h1 className="text-center text-2xl font-bold">Kasa PIN’inizi belirleyin</h1>
    <p className="mb-6 mt-2 text-center text-sm text-muted">İlk kurulumda PIN’inizi siz seçersiniz. {conflict ? "Önce tarayıcının eski kasa eşlemesini kontrol edin." : device ? "Mevcut cihaz eşlemesi korunur." : "Bu tarayıcı seçili şubenize kasa olarak bağlanır."}</p>
    <Card className="p-6">{conflict && device
      ? <BrowserRegisterSwitch deviceId={device.id} tenantName={device.tenantName} />
      : <RegisterSetupForm name={admin.name} paired={Boolean(device)} pairedDeviceId={device?.id ?? null} />}</Card>
  </main>;
}
