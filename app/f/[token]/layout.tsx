// Kök loading.tsx (#56) /f segmentini de sarmalayıp notFound()'u 200 shell içinde bırakıyordu (soft 404);
// doğrulama layout'ta yapılmadan shell basılmaz → gerçek 404 statüsü döner (e2e m8 buna dayanır).
import { notFound } from "next/navigation";
import { docByToken } from "./doc";

export const dynamic = "force-dynamic";

export default async function FaturaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await docByToken(token))) notFound();
  return children;
}
