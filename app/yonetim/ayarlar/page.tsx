import { PageHeader } from "@/components/ui";
import { HUBS, visibleChildren } from "../nav-data";
import { navContext } from "../_hub/context";
import { HubCards } from "../_hub/Hub";

export const dynamic = "force-dynamic";

export default async function AyarlarHub() {
  const { ctx } = await navContext();
  const hub = HUBS.find((h) => h.href === "/yonetim/ayarlar")!;
  return (
    <>
      <PageHeader title="Ayarlar" desc="Şube, cihaz, abonelik ve sistem ayarlarınızı buradan yönetin." />
      <HubCards items={visibleChildren(hub, ctx)} />
    </>
  );
}
