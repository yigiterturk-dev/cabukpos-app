// Kök loading.tsx (#56) /f segmentini de sarmalayıp notFound()'u 200 shell içinde bırakıyordu (soft 404);
// doğrulama layout'ta yapılmadan shell basılmaz → gerçek 404 statüsü döner (e2e m8 buna dayanır).
// Kök loading.tsx tasarım turunda geri gelince (19e8fb6) streaming yine 200 basabildi →
// notFound artık generateMetadata'da da atılıyor: metadata çözülmeden header yazılmaz, durum gerçek 404 olur.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { docByToken } from "./doc";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  if (!(await docByToken(token))) notFound();
  return {};
}

export default async function FaturaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await docByToken(token))) notFound();
  return children;
}
