import type { Metadata } from "next";
import { SellerBlock } from "@/components/Legal";

export const metadata: Metadata = { title: "İletişim · ÇabukPOS" };

export default function Iletisim() {
  return (
    <>
      <h1>Hakkımızda ve iletişim</h1>
      <p>ÇabukPOS, restoran ve marketler için internet kesintisinde de çalışan bulut satış noktası yazılımıdır: kasa, masa ve adisyon, mutfak ekranı, paket servis ve kurye, stok ve reçete, barkod ve terazi, raporlar.</p>
      <h2>Satıcı bilgileri</h2>
      <SellerBlock />
      <h2>Destek ve başvurular</h2>
      <p>Destek, iade ve KVKK başvurularınızı yukarıdaki e-posta adresine iletebilirsiniz. KVKK başvuruları en geç 30 gün içinde yanıtlanır.</p>
    </>
  );
}
