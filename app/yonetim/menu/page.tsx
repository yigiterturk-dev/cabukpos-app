import Link from "next/link";
import { PageHeader, buttonClass } from "@/components/ui";
import { HUBS, visibleChildren } from "../nav-data";
import { navContext } from "../_hub/context";
import { HubCards } from "../_hub/Hub";

export const dynamic = "force-dynamic";

export default async function MenuHub() {
  const { ctx } = await navContext();
  const hub = HUBS.find((h) => h.href === "/yonetim/menu")!;
  return (
    <>
      <PageHeader
        title="Menü"
        desc="Ürünlerinizi, fiyatlarınızı ve reçetelerinizi tek yerden yönetin. Ne yapmak istediğinizi seçin."
        actions={<Link href="/kasa" className={buttonClass("secondary")}>Kasayı aç</Link>}
      />
      <HubCards items={visibleChildren(hub, ctx)} />
    </>
  );
}
