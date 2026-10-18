// lib/admin/salon.ts — Salon yönetimi saf ayrıştırıcıları (test edilir).
import { parseTL } from "@/lib/core/money";

/** "M1-M12" → M1…M12; "Bahçe 1-4" → Bahçe 1…Bahçe 4; virgülle birden çok; tek ad da olur. */
export function expandTableNames(input: string): string[] | null {
  const out: string[] = [];
  for (const part of input.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = /^(.*?)(\d{1,3})\s*-\s*\1?(\d{1,3})$/.exec(part);
    if (m) {
      const [from, to] = [Number(m[2]), Number(m[3])];
      if (to < from || to - from > 99) return null;
      for (let i = from; i <= to; i++) out.push(`${m[1]}${i}`);
    } else out.push(part);
  }
  return out.length && out.length <= 200 && out.every((n) => n.length <= 20) ? out : null;
}

/** "Peynir +15" · "Yarım -90" · "Az pişmiş" (fark yok) — satır başına bir seçenek. */
export function parseOptionLines(text: string): { name: string; delta: number }[] | string {
  const out: { name: string; delta: number }[] = [];
  for (const raw of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = /^(.*?)\s+([+-])\s*(\d[\d.,]*)\s*(?:₺|tl)?$/i.exec(raw);
    const name = (m ? m[1] : raw).trim();
    let delta = 0;
    if (m) {
      const k = parseTL(m[3]);
      if (k === null) return `Fark okunamadı: ${raw}`;
      if (k > 2_147_483_647) return `Fiyat farkı en çok 21.474.836,47 olabilir: ${raw}`;
      delta = m[2] === "-" ? -k : k;
    }
    if (name.length < 1 || name.length > 60) return `Seçenek adı 1-60 karakter: ${raw}`;
    if (out.some((o) => o.name === name)) return `Aynı seçenek iki kez: ${name}`;
    out.push({ name, delta });
  }
  return out.length ? (out.length <= 30 ? out : "En çok 30 seçenek.") : "En az bir seçenek yazın.";
}
