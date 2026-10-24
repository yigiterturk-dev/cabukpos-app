import { deliveryStatus, type TabState } from "./tab";
import { istToday } from "./report";
import { csvCell } from "./accounting";
import { PLATFORM_NAMES } from "./platform";
import { intentLabel, readyDeliveryEvents } from "./delivery";
import { normalizeSearchText } from "./search";

export const deliveryStageLabels = { onay_bekliyor: "Onay bekliyor", hazirlaniyor: "Hazırlanıyor", hazir: "Hazır", yolda: "Yolda", teslim: "Teslim edildi", iptal: "İptal", reddedildi: "Reddedildi" } as const;
export const isDeliveryActive = (t: TabState) => t.kind !== "masa" && !t.closed && !["teslim", "iptal", "reddedildi"].includes(deliveryStatus(t));
export const deliveryDay = (t: TabState) => istToday(Date.parse(t.delivery.deliveredAt ?? t.closedAt ?? t.openedAt));
export const deliveryChannel = (t: TabState) => t.order?.source ? PLATFORM_NAMES[t.order.source.platform] ?? t.order.source.platform : "Telefon / gel-al";
/** Opt-in assignment on the dispatcher's Ready button; never overrides an existing courier. */
export function readyDispatchEvents(t: TabState, tabs: Iterable<TabState>, couriers: { id: string; name: string }[], autoAssign: boolean, newId: () => string, now: number) {
  const events = readyDeliveryEvents(t, newId);
  if (!events.length || !autoAssign || t.kind !== "paket" || t.delivery.courierId) return events;
  // Historical staff must not be selected for a new assignment.
  const available = courierSummary(tabs, couriers, istToday(now), now).find(c => couriers.some(active => active.id === c.id));
  if (available) events.push({ type: "courier", staffId: available.id });
  return events;
}
export function deliveryTimes(t: TabState, now: number) {
  const mins = (from: string, to: string | number) => Math.max(0, Math.floor(((typeof to === "number" ? to : Date.parse(to)) - Date.parse(from)) / 60_000));
  const end = t.delivery.deliveredAt ?? t.closedAt ?? now;
  const prepared = t.tickets.length > 0 && t.tickets.every(ticket => ticket.status === "hazir" || ticket.status === "teslim");
  const readyAt = prepared && t.tickets.every(ticket => ticket.readyAt && Number.isFinite(Date.parse(ticket.readyAt))) ? new Date(Math.max(...t.tickets.map(ticket => Date.parse(ticket.readyAt!)))).toISOString() : null;
  return {
    total: mins(t.openedAt, end),
    readyAt,
    acceptance: t.delivery.acceptedAt ? mins(t.openedAt, t.delivery.acceptedAt) : null,
    // Use station-ready events, never lastAt (which also changes on payment/courier assignment).
    preparing: t.kind === "platform" && !t.delivery.acceptedAt ? null : readyAt ? mins(t.delivery.acceptedAt ?? t.openedAt, readyAt) : prepared || t.delivery.outAt || t.delivery.deliveredAt ? null : mins(t.delivery.acceptedAt ?? t.openedAt, end),
    journey: t.delivery.outAt ? mins(t.delivery.outAt, end) : null,
    late: isDeliveryActive(t) && !!t.delivery.prepMin && !prepared && !t.delivery.outAt && mins(t.delivery.acceptedAt ?? t.openedAt, now) > t.delivery.prepMin,
  };
}
export function dispatchFilter(tabs: Iterable<TabState>, options: { query?: string; status?: string; courierId?: string; day?: string; activeOnly?: boolean }) {
  const q = normalizeSearchText(options.query?.trim() ?? "");
  return [...tabs].filter(t => t.kind !== "masa" && !t.mergedAway)
    .filter(t => !options.day || deliveryDay(t) === options.day)
    .filter(t => !options.activeOnly || isDeliveryActive(t))
    .filter(t => !options.status || deliveryStatus(t) === options.status)
    .filter(t => !options.courierId || (options.courierId === "unassigned" ? !t.delivery.courierId : t.delivery.courierId === options.courierId))
    .filter(t => !q || [t.order?.name, t.order?.phone, t.order?.address, t.order?.source?.externalId, deliveryChannel(t), ...t.lines.filter(l => !l.voided).map(l => l.name)].some(v => v && normalizeSearchText(v).includes(q)))
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}
export function courierSummary(tabs: Iterable<TabState>, couriers: { id: string; name: string }[], day: string, now: number) {
  const all = [...tabs].filter(t => t.kind !== "masa" && !t.mergedAway);
  // Keep historical couriers visible even if they are no longer in today's active staff catalog.
  const names = new Map(couriers.map(c => [c.id, c.name]));
  for (const t of all) if (t.delivery.courierId && !names.has(t.delivery.courierId)) names.set(t.delivery.courierId, "Eski kurye");
  return [...names].map(([id, name]) => {
    const assigned = all.filter(t => t.delivery.courierId === id);
    const active = assigned.filter(isDeliveryActive);
    const done = assigned.filter(t => deliveryStatus(t) === "teslim" && deliveryDay(t) === day);
    const sum = (method: string) => done.filter(t => t.delivery.method === method).reduce((s, t) => s + t.total, 0);
    const journeys = done.map(t => deliveryTimes(t, now).journey).filter((v): v is number => v !== null);
    return { id, name, active: active.length, onRoad: active.filter(t => !!t.delivery.outAt).length, ready: active.filter(t => deliveryStatus(t) === "hazir").length, delivered: done.length, total: done.reduce((s, t) => s + t.total, 0), cash: sum("nakit"), card: sum("kart"), online: sum("online"), meal: sum("yemek_karti"), averageJourney: journeys.length ? Math.round(journeys.reduce((a, b) => a + b, 0) / journeys.length) : null };
  }).sort((a, b) => a.active - b.active || a.name.localeCompare(b.name, "tr"));
}
export function dispatchCsv(tabs: TabState[], couriers: { id: string; name: string }[]) {
  const rows: (string | number)[][] = [["Sipariş", "Tarih", "Kanal", "Müşteri", "Durum", "Kurye", "Ödeme", "Tutar", "Kalan"]];
  for (const t of tabs) rows.push([t.order?.source?.externalId ?? t.id, t.openedAt, deliveryChannel(t), t.order?.name ?? "", deliveryStageLabels[deliveryStatus(t)], couriers.find(c => c.id === t.delivery.courierId)?.name ?? "Atanmamış", intentLabel(t.delivery.method ?? t.order?.payIntent ?? null), (t.total / 100).toFixed(2), (t.remaining / 100).toFixed(2)]);
  return "\ufeff" + rows.map(row => row.map(v => csvCell(v, ";")).join(";")).join("\r\n") + "\r\n";
}
