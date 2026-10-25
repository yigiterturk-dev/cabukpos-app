"use client";
import { useFormAction } from "@/components/useFormAction";
import { attendanceAction } from "@/lib/admin/attendance-actions";
import { Button } from "@/components/ui";
export function AttendanceForm({ staffId, sessionId }: { staffId: string; sessionId?: string }) {
  const { state, pending, onSubmit } = useFormAction(attendanceAction, {} as { error?: string; savedAt?: number });
  return <form onSubmit={onSubmit}><input type="hidden" name="staffId" value={staffId} /><input type="hidden" name="sessionId" value={sessionId ?? ""} /><input type="hidden" name="direction" value={sessionId ? "out" : "in"} /><Button type="submit" disabled={pending} variant={sessionId ? "secondary" : "primary"}>{pending ? "Kaydediliyor…" : sessionId ? "Çıkış kaydet" : "Giriş kaydet"}</Button>{state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}</form>;
}
