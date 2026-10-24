export const LOCATION_FRESH_MS = 90_000;
export const LOCATION_EXPIRE_MS = 15 * 60_000;
export type CourierPosition = { staffId: string; latitude: number; longitude: number; accuracy: number; observedAt: string };
export function parseCourierPosition(input: unknown, now: number) {
  if (!input || typeof input !== "object") return null;
  const { latitude, longitude, accuracy, timestamp } = input as Record<string, unknown>;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000 || typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < now - 120000 || timestamp > now + 10000) return null;
  return { latitudeE6: Math.round(latitude * 1000000), longitudeE6: Math.round(longitude * 1000000), accuracy: Math.ceil(accuracy), observedAt: new Date(timestamp) };
}
export const positionFresh = (p: CourierPosition, now: number) => {
  const age = now - Date.parse(p.observedAt);
  return age >= -10000 && age <= LOCATION_FRESH_MS;
};
export function positionMapUrl(p: CourierPosition) {
  const lat = Math.max(-85, Math.min(85, p.latitude));
  const lon = Math.max(-179.98, Math.min(179.98, p.longitude));
  const bbox = [lon - .015, lat - .01, lon + .015, lat + .01].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${p.latitude},${p.longitude}`;
}
