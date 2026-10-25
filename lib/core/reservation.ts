// lib/core/reservation.ts — #49 rezervasyon saf yardımcıları (DB yok, testli).
import { isValidCalendarDay } from "./report";

export const RES_STATUSES = ["bekliyor", "onaylandi", "geldi", "gelmedi", "iptal"] as const;
export type ResStatus = (typeof RES_STATUSES)[number];
export const RES_LABEL: Record<ResStatus, string> = { bekliyor: "Bekliyor", onaylandi: "Onaylı", geldi: "Geldi", gelmedi: "Gelmedi", iptal: "İptal" };

/** Geçerli rezervasyon alanları; hata metni ya da null döner. */
export function validateReservation(v: { name: string; phone: string; guests: number; note: string }): string | null {
  if (!v.name.trim() || v.name.trim().length > 120) return "İsim 1-120 karakter olmalı.";
  if (!/^\d{6,15}$/.test(v.phone)) return "Telefon 6-15 rakam olmalı; ülke koduyla girebilirsiniz.";
  if (!Number.isInteger(v.guests) || v.guests < 1 || v.guests > 99) return "Kişi sayısı 1-99 olmalı.";
  if (v.note.length > 300) return "Not en çok 300 karakter.";
  return null;
}

/** "19:30" → o günün İstanbul saatine göre UTC anı; geçersiz saat null. */
export function timeToAt(day: string, time: string): Date | null {
  if (!isValidCalendarDay(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return new Date(`${day}T${time}:00+03:00`);
}

export function freeReservationTables<T extends { id: string; seats: number }>(tables: T[], occupied: { tableId: string | null; guests: number }[]): T[] {
  let free = tables.filter(t => !occupied.some(r => r.tableId === t.id));
  for (const r of occupied.filter(r => !tables.some(t => t.id === r.tableId)).sort((a, b) => b.guests - a.guests)) {
    const candidate = [...free].sort((a, b) => a.seats - b.seats).find(t => t.seats >= r.guests);
    if (!candidate) return [];
    free = free.filter(t => t.id !== candidate.id);
  }
  return free;
}
