import { isValidCalendarDay } from "./report";

export const PLAN_KINDS = { vardiya: "Çalışma vardiyası", gorev: "Görev" } as const;
export const PLAN_STATUSES = { planlandi: "Planlandı", suruyor: "Devam ediyor", tamamlandi: "Tamamlandı", iptal: "İptal" } as const;
export type PlanKind = keyof typeof PLAN_KINDS;
export type PlanStatus = keyof typeof PLAN_STATUSES;
export const isPlanKind = (s: string): s is PlanKind => Object.hasOwn(PLAN_KINDS, s);
export const isPlanStatus = (s: string): s is PlanStatus => Object.hasOwn(PLAN_STATUSES, s);
export const isPlanId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Turkish local wall clock, including overnight plans through an explicit end date. */
export function planAt(local: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(local) || !isValidCalendarDay(local.slice(0, 10))) return null;
  return new Date(`${local}:00+03:00`);
}
export const planLocal = (at: Date) => new Date(at.getTime() + 3 * 3600000).toISOString().slice(0, 16);
export const planMinutes = (start: Date, end: Date, pause: number) => Math.round((end.getTime() - start.getTime()) / 60000) - pause;
export type PlanInput = { id: string; revision: number | null; staffId: string; kind: PlanKind; title: string; startsAt: Date; endsAt: Date; breakMinutes: number; note: string };
export type PlanProblem = { error: string; field?: string };
export function parsePlan(input: Record<string, string>, now: number): PlanInput | PlanProblem {
  if (!isPlanId(input.id ?? "") || !isPlanId(input.staffId ?? "")) return { error: "Personel seçin.", field: "staffId" };
  if (!isPlanKind(input.kind ?? "")) return { error: "Plan türü seçin.", field: "kind" };
  const title = (input.title ?? "").trim(), note = (input.note ?? "").trim();
  if (title.length < 2 || title.length > 120) return { error: "Başlık 2–120 karakter olmalı.", field: "title" };
  if (note.length > 1000) return { error: "Not en fazla 1000 karakter olabilir.", field: "note" };
  const startsAt = planAt(input.startsAt ?? ""), endsAt = planAt(input.endsAt ?? "");
  if (!startsAt) return { error: "Geçerli başlangıç tarihi ve saati girin.", field: "startsAt" };
  if (!endsAt || endsAt <= startsAt) return { error: "Bitiş başlangıçtan sonra olmalı. Gece vardiyasında ertesi günü seçin.", field: "endsAt" };
  const duration = (endsAt.getTime() - startsAt.getTime()) / 60000;
  if (duration > (input.kind === "vardiya" ? 1440 : 31 * 1440)) return { error: input.kind === "vardiya" ? "Bir çalışma vardiyası en fazla 24 saat olabilir." : "Görev aralığı en fazla 31 gün olabilir.", field: "endsAt" };
  if (startsAt.getTime() < now - 366 * 86400000 || endsAt.getTime() > now + 366 * 86400000) return { error: "Geçmiş veya gelecek bir yıl içinden tarih seçin.", field: "startsAt" };
  const breakMinutes = input.kind === "gorev" ? 0 : Number(input.breakMinutes ?? "0");
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720 || breakMinutes >= duration) return { error: "Mola 0–720 dakika arasında ve vardiyadan kısa olmalı.", field: "breakMinutes" };
  const revision = input.revision ? Number(input.revision) : null;
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 1)) return { error: "Plan değişti. Sayfayı yenileyin." };
  return { id: input.id, revision, staffId: input.staffId, kind: input.kind as PlanKind, title, note, startsAt, endsAt, breakMinutes };
}

export function planWeekStart(day: string) {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() - (at.getUTCDay() + 6) % 7);
  return at.toISOString().slice(0, 10);
}
export function planDayOffset(day: string, days: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
