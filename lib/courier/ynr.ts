// lib/courier/ynr.ts — YNR Kurye sevk istemcisi (dış kurye). Sözleşme: ynr-kurye/docs/integrations.md, provider "cabukpos".
// Ağa çıkan tek yer burasıdır; DB bilmez. YNR_DRY_RUN=1 iken istek atılmaz, sahte başarı döner.
export type YnrConfig = {
  base: string;
  token: string;
  provider: string;
  /** storeId → YNR mağaza (account) kimliği. */
  accounts: Record<string, string>;
  /** storeId → paketin alınacağı restoran noktası. İstemci koordinatı bunu değiştirmez. */
  pickups: Record<string, { address: string; lat: number; lng: number }>;
  dryRun: boolean;
};

export type YnrSendOrder = {
  provider: string;
  accountId: string;
  externalOrderId: string;
  dispatchReady: boolean;
  order: {
    customerName: string;
    customerPhone: string;
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffAddress: string;
    dropoffLat: number;
    dropoffLng: number;
    price: number;
    codAmount: number;
    notes?: string;
  };
};

export type YnrStatus = {
  ok: true;
  apiVersion: 2;
  id: string;
  code: string;
  externalOrderId: string;
  status: string;
  dispatchReady: boolean;
  assignmentPending?: boolean;
  arrival?: { courierName?: string | null; vehicle?: string | null; etaMinutes?: number | null };
  collection?: { amountMinor: number; collected: boolean; verified: boolean };
  updatedAt: string;
};

export type YnrResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };
export type YnrDeps = { fetch?: typeof fetch; timeoutMs?: number };

export class YnrError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "YnrError";
    this.status = status;
  }
}

const TIMEOUT_MS = 8000;

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Bozuk/beklenmeyen cevap gövdesini Türkçe, sınırlı uzunlukta hataya çevirir. */
function errorText(status: number, body: string): string {
  const msg = parseJson(body)?.error;
  const detail = typeof msg === "string" && msg ? msg.slice(0, 200) : body.replace(/\s+/g, " ").trim().slice(0, 200);
  return detail ? `YNR ${status}: ${detail}` : `YNR ${status}`;
}

function fromEnv(env: NodeJS.ProcessEnv): YnrConfig | null {
  const base = env.YNR_API_BASE?.trim();
  const token = env.YNR_TOKEN?.trim();
  if (!base || !token) return null;
  const read = <T>(name: string): T | null => {
    const raw = env[name]?.trim();
    if (!raw) return null;
    try {
      const v: unknown = JSON.parse(raw);
      return v && typeof v === "object" ? (v as T) : null;
    } catch {
      return null;
    }
  };
  const accounts = read<Record<string, string>>("YNR_ACCOUNTS_JSON") ?? {};
  const pickups = read<YnrConfig["pickups"]>("YNR_PICKUPS_JSON") ?? {};
  return { base: base.replace(/\/+$/, ""), token, provider: env.YNR_PROVIDER?.trim() || "cabukpos", accounts, pickups, dryRun: env.YNR_DRY_RUN === "1" };
}

let cached: YnrConfig | null = null;
export function ynrConfig(env: NodeJS.ProcessEnv = process.env): YnrConfig | null {
  if (env !== process.env) return fromEnv(env);
  cached ??= fromEnv(env);
  return cached;
}

export function ynrTarget(cfg: YnrConfig, storeId: string) {
  const accountId = cfg.accounts[storeId];
  const pickup = cfg.pickups[storeId];
  return accountId && pickup ? { accountId, pickup } : null;
}

export function createYnrClient(cfg: YnrConfig, deps: YnrDeps = {}) {
  const doFetch = deps.fetch ?? fetch;
  const timeout = deps.timeoutMs ?? TIMEOUT_MS;

  async function call<T>(method: "POST" | "GET", path: string, body?: unknown): Promise<YnrResult<T>> {
    if (cfg.dryRun) return { ok: true, status: 0, data: { ok: true, dryRun: true } as T };
    try {
      const res = await doFetch(`${cfg.base}${path}`, {
        method,
        headers: { authorization: `Bearer ${cfg.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      const raw = await res.text();
      if (!res.ok) return { ok: false, status: res.status, error: errorText(res.status, raw) };
      const json = parseJson(raw);
      if (!json) return { ok: false, status: res.status, error: "YNR cevabı okunamadı." };
      return { ok: true, status: res.status, data: json as T };
    } catch (e) {
      const message = e instanceof Error && e.name === "TimeoutError" ? "YNR isteği zaman aşımına düştü." : "YNR'ye ulaşılamadı.";
      return { ok: false, status: 0, error: message };
    }
  }

  return {
    /** Siparişi gönderir; aynı (provider, accountId, externalOrderId) ikinci kez kayıt açmaz. */
    sendOrder: (order: YnrSendOrder) => call<{ ok: boolean; duplicate?: boolean; dispatchReady?: boolean; code?: string } | { ok: true; dryRun: true }>("POST", "/api/integrations/orders", order),
    cancelOrder: (order: { provider: string; accountId: string; externalOrderId: string; postPickupFlag?: boolean }) => call<{ ok: boolean } | { ok: true; dryRun: true }>("POST", "/api/integrations/orders/cancel", order),
    getStatus: (q: { provider: string; accountId: string; externalOrderId: string }) => {
      const url = new URLSearchParams({ provider: q.provider, accountId: q.accountId, externalOrderId: q.externalOrderId });
      return call<YnrStatus | { ok: true; dryRun: true }>("GET", `/api/integrations/orders/status?${url.toString()}`);
    },
  };
}
