import { PageHeader } from "@/components/ui";
import { HUBS, visibleChildren } from "../nav-data";
import { navContext } from "../_hub/context";
import { HubCards } from "../_hub/Hub";

export const dynamic = "force-dynamic";

export default async function SatisHub() {
  const { ctx } = await navContext();
  const hub = HUBS.find((h) => h.href === "/yonetim/satis")!;
  return (
    <>
      <PageHeader title="Satış" desc="Salon, rezervasyon, pazaryerleri ve kurye işlerinizi buradan yönetin." />
      <HubCards items={visibleChildren(hub, ctx)} />
    </>
  );
}
