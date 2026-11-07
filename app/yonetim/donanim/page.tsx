import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema, withTenant } from "@/db";
import { requireAdmin } from "@/lib/auth/session";
import { canUseStore } from "@/lib/core/access";
import { scopedStoreId } from "@/lib/admin/store-scope";
import { newAgentPairing, revokeAgent } from "@/lib/admin/agent-actions";
import { RevokeForm } from "@/components/admin/RevokeForms";
import { agentConfig, emptyAgentConfig } from "@/lib/agent/config";
import { agentHost } from "@/lib/agent/dns";
import { AgentConfigForm, AgentCreateForm, AgentPairButton } from "@/components/admin/AgentForms";
import { Badge, buttonClass, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const dt = (d: Date) => d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const ONLINE_MS = 3 * 60_000;
const within = (d: Date | null, ms: number) => !!d && Date.now() - d.getTime() < ms;
const future = (d: Date | null) => !!d && d.getTime() > Date.now();

export default async function Donanim() {
  const u = await requireAdmin();
  const [activeStoreId, stores] = await withTenant(u.tenantId, (tx) => Promise.all([
    scopedStoreId(tx, u.tenantId, u.storeId),
    tx.select({ id: schema.stores.id, name: schema.stores.name }).from(schema.stores),
  ]));
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  const rows = (await getDb().select().from(schema.agents).where(eq(schema.agents.tenantId, u.tenantId)).orderBy(asc(schema.agents.createdAt))).filter((r) => canUseStore(u, r.storeId));
  return (
    <>
      <PageHeader title="Yazıcı ve donanım" desc="Kasadaki bilgisayarda çalışan ÇabukPOS ajanı fiş yazıcısını, para çekmecesini ve teraziyi yönetir." />
      <Card className="mb-6 p-5">
        {activeStoreId ? <AgentCreateForm /> : <div className="space-y-3 text-sm text-muted"><p>Ajan eklemeden önce bir şube oluşturun.</p><Link href="/yonetim/subeler" className={buttonClass("primary")}>Şube ekle</Link></div>}
        <p className="mt-4 break-words rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn" data-testid="lna-note">Kasa ekranında Chrome “yerel ağ erişimi” izni sorduğunda <strong>İzin ver</strong> deyin; aksi halde ajan “kapalı” görünür.</p>
        <div className="mt-4 rounded-lg border border-brand/30 bg-brand-soft px-3 py-3 text-sm">
          <p className="font-medium">Tek yazıcı: ajansız kurulum (önerilen)</p>
          <p className="mt-1 text-ink-2">Termal yazıcıyı Windows’ta varsayılan yazıcı yapın, dosyayı indirip çift tıklayın. Masaüstüne ve bilgisayar açılışına “ÇabukPOS Kasa” gelir; sipariş gelince sorusuz fiş basar ve öter. Kasaya bir kez giriş yapın. Çekmece ve terazi için ajan gerekir.</p>
          <a href="/api/agent/kisayol" download className={`${buttonClass("primary")} mt-2`}>Kasa kısayolunu indir</a>
        </div>
        <div className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-3 text-sm">
          <p className="font-medium">Birden çok yazıcı, çekmece, terazi: ajan kurulumu</p>
          <p className="mt-1 text-ink-2">Önce yukarıdan eşleme kodu üretin. Sonra dosyayı indirip çift tıklayın: Node.js yoksa kendisi kurar, eşleme kodunu sorar, ajanı bilgisayar açılışına ekler. Bir kez yapılır, yalnız yazıcının bağlı olduğu kasa bilgisayarında.</p>
          <a href="/api/agent/kurulum" download className={`${buttonClass("primary")} mt-2`}>Windows kurulumunu indir</a>
          <p className="mt-2 text-xs text-muted">Windows “bilinmeyen yayıncı” uyarısı verirse: Ek bilgi → Yine de çalıştır. Elle kurmak için: <a href="/indir/cabukpos-agent-install.ps1" download className="text-brand underline">PowerShell betiği</a>.</p>
        </div>
        <details className="mt-4 text-sm text-ink-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2.5 font-medium outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-brand-ring/60">Kurulum adımları</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Kasadaki bilgisayara Node.js (LTS) kurun.</li>
            <li><a href="/indir/cabukpos-agent.cjs" download className="font-medium text-brand underline">cabukpos-agent.cjs</a> dosyasını indirip bir klasöre koyun (ör. <code>C:\CabukPOS</code>).</li>
            <li>O klasörde komut satırı açıp <code>node cabukpos-agent.cjs pair KOD</code> yazın.</li>
            <li><code>node cabukpos-agent.cjs install</code> — bilgisayar açılınca ajan kendiliğinden başlar.</li>
            <li>Aşağıda yazıcıyı tanımlayın; <code>node cabukpos-agent.cjs test-print</code> ile deneme fişi basın. Terazi ve çekmece provası: <code>test-scale</code>, <code>test-drawer</code>.</li>
            <li>Kasayı Chrome&apos;da açın. Chrome “yerel ağdaki cihazlara erişmek istiyor” diye sorarsa <strong>İzin ver</strong> deyin; yoksa yazıcı, çekmece ve terazi çalışmaz. Yanlışlıkla engellendiyse: adres çubuğundaki kilit simgesi → Site ayarları → Yerel ağ erişimi → İzin ver, sonra sayfayı yenileyin.</li>
          </ol>
        </details>
      </Card>
      {rows.length === 0 ? <Empty>Henüz ajan yok. Yazıcı ya da terazi kullanmıyorsanız gerekmez; fiş tarayıcıdan da yazdırılır.</Empty> : (
        <div className="space-y-6">
          {rows.map((r) => {
            const online = within(r.lastSeenAt, ONLINE_MS);
            const parsed = agentConfig.safeParse(r.config);
            const cfg = parsed.success ? parsed.data : emptyAgentConfig();
            return (
              <Card key={r.id} className="p-5" data-testid={`agent-${r.id}`}>
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <div className="min-w-0 break-words font-medium">{r.name}<span className="ml-2 font-normal text-muted">· {storeNames.get(r.storeId) ?? "Şube bulunamadı"}</span></div>
                  {r.revokedAt ? <Badge tone="bad">İptal</Badge> : !r.pairedAt ? <Badge tone="warn">Eşlenmedi</Badge> : online ? <Badge tone="ok">Çevrimiçi</Badge> : <Badge tone="warn">Çevrimdışı</Badge>}
                  {r.lastSeenAt && <span className="min-w-0 break-words text-xs text-muted">Son görülme {dt(r.lastSeenAt)}{r.version ? ` · sürüm ${r.version}` : ""}{r.lanIp ? ` · ${r.lanIp}` : ""}</span>}
                  <div className="ml-auto flex shrink-0 flex-wrap items-start gap-4 text-sm">
                    <AgentPairButton action={newAgentPairing.bind(null, r.id)} />
                    <RevokeForm action={revokeAgent.bind(null, r.id)} ariaLabel={`Ajanı iptal et: ${r.name}`} revoked={Boolean(r.revokedAt)} />
                  </div>
                </div>
                {r.status && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {r.status.printers.map((p) => {
                      const name = cfg.printers.find((x) => x.id === p.id)?.name ?? p.id;
                      return <li key={p.id} data-testid={`printer-status-${p.id}`} className="break-words">{name}: {p.ok === null ? <span className="text-muted">henüz yazdırılmadı</span> : p.ok ? <span className="text-ok">hazır</span> : <span className="text-bad">hata — {p.error}</span>}</li>;
                    })}
                    {r.status.failed > 0 && <li className="text-bad">{r.status.failed} fiş yazdırılamadı (kasada “Yeniden dene”)</li>}
                  </ul>
                )}
                <p className="mt-2 break-words text-xs text-muted">
                  {future(r.certExpiresAt) ? <>Tablet ve diğer kasalar ağdan bağlanabilir: {agentHost(r.id)}</> : <>Yalnız bu bilgisayardaki kasa bağlanır (ağ sertifikası yok).</>}
                </p>
                {!r.revokedAt && <div className="mt-5 border-t border-line pt-5"><AgentConfigForm agentId={r.id} initial={cfg} /></div>}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
