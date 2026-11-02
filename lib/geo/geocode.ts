// lib/geo/geocode.ts — Adres → koordinat (Nominatim). Sunucu tarafı; tek süreç içi önbellek ve 1 istek/sn sınırı.
// Kurye sevki için teslim noktası zorunlu olduğundan adresin çözülememesi çağıran tarafta 422'ye dönüşür.
export type Coords = { lat: number; lng: number };

const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 6000;
const cache = new Map<string, { at: number; value: Coords | null }>();
// Başarısız çözüm kısa süre önbelleklenir: geçici hata kalıcı "adres yok" sayılmasın.
const MISS_TTL_MS = 60_000;
let nextSlot = 0;

const key = (address: string) => address.trim().replace(/\s+/g, " ").toLowerCase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Türkiye sınırları dışındaki veya yarım kalan cevaplar geçersiz sayılır. */
export function inTurkey(c: Coords): boolean {
  return Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.lat >= 35 && c.lat <= 43 && c.lng >= 25 && c.lng <= 45;
}

export async function geocode(address: string, deps: { fetch?: typeof fetch; now?: () => number } = {}): Promise<Coords | null> {
  const k = key(address);
  if (!k) return null;
  const nowMs = (deps.now ?? Date.now)();
  const hit = cache.get(k);
  if (hit && (hit.value !== null || nowMs - hit.at < MISS_TTL_MS)) return hit.value;

  const now = deps.now ?? Date.now;
  const wait = nextSlot - now();
  if (wait > 0) await sleep(wait);
  nextSlot = now() + MIN_GAP_MS;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "tr");
  url.searchParams.set("accept-language", "tr");

  let result: Coords | null = null;
  try {
    const res = await (deps.fetch ?? fetch)(url, {
      headers: { "user-agent": process.env.GEOCODE_USER_AGENT ?? "cabukpos/1.0", accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const rows: unknown = await res.json();
      const first = Array.isArray(rows) ? rows[0] : null;
      if (first && typeof first === "object" && "lat" in first && "lon" in first) {
        const c = { lat: Number((first as { lat: unknown }).lat), lng: Number((first as { lon: unknown }).lon) };
        if (inTurkey(c)) result = c;
      }
    }
  } catch {
    result = null;
  }
  cache.set(k, { at: (deps.now ?? Date.now)(), value: result });
  return result;
}

/** Testler için yalnız süreç içi önbelleği temizler. */
export function clearGeocodeCache() {
  cache.clear();
  nextSlot = 0;
}
