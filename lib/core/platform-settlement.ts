export function settlementMath(gross: number, online: number, bps: number, base: "gross" | "online", courierCost: number, adjustment: number, actual: number) {
  if (![gross, online, bps, courierCost, adjustment, actual].every(Number.isSafeInteger) || bps < 0 || bps > 10000 || courierCost < 0 || actual < 0) throw new Error("Tutarları ve komisyon oranını kontrol edin.");
  const commission = Math.round((base === "gross" ? gross : online) * bps / 10000);
  const expected = online - commission - courierCost + adjustment;
  if (![gross,online,courierCost,adjustment,actual,commission, expected, actual - expected].every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=2147483647)) throw new Error("Tutar sınırı aşıldı.");
  return { commission, expected, difference: actual - expected };
}
