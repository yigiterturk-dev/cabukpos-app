// lib/agent/config.ts — Ajan yapılandırması (yönetimde düzenlenir, heartbeat'le ajana iner). Bulut + ajan ortak.
import { z } from "zod";

export const PRINTER_ROLES = [{ value: "fis", label: "Fiş" }, { value: "mutfak", label: "Mutfak" }, { value: "etiket", label: "Etiket" }] as const;
export const TRANSPORTS = [
  { value: "ag", label: "Ağ (IP:9100)", hint: "192.168.1.50 ya da 192.168.1.50:9100" },
  { value: "paylasim", label: "Windows paylaşılan yazıcı", hint: "Paylaşım adı, ör. XP80" },
  { value: "cups", label: "CUPS (Mac/Linux)", hint: "Yazıcı adı" },
  { value: "dosya", label: "Aygıt dosyası", hint: "/dev/usb/lp0" },
] as const;

export const printerConfig = z.object({
  id: z.string().regex(/^[a-z0-9]{1,12}$/),
  name: z.string().trim().min(1).max(40),
  role: z.enum(["fis", "mutfak", "etiket"]),
  transport: z.enum(["ag", "paylasim", "cups", "dosya"]),
  address: z.string().trim().min(1).max(200),
  width: z.union([z.literal(58), z.literal(80)]),
  codepage: z.enum(["pc857", "ascii"]),
  brand: z.enum(["genel", "epson", "xprinter"]).default("genel"), // kesme davranışı (#36)
  drawer: z.boolean(), // para çekmecesi bu yazıcıya bağlı
});

/** Fiş logosu (#36 kalanı): packBits çıktısının base64'ü; genişlik 8'in katı. */
export const logoConfig = z.object({
  w: z.number().int().min(8).max(576).multipleOf(8),
  h: z.number().int().min(1).max(240),
  data: z.base64().max(24_000), // 576×240 noktanın base64'ü ~23 KB
});

export const scaleConfig = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("yok") }),
  z.object({ kind: z.literal("seri"), port: z.string().trim().regex(/^(COM\d{1,3}|\/dev\/[\w./-]+)$/), baud: z.number().int().min(1200).max(115200), request: z.enum(["enq", "w", "yok"]) }),
  z.object({ kind: z.literal("tcp"), host: z.string().trim().min(1).max(100), port: z.number().int().min(1).max(65535), request: z.enum(["enq", "w", "yok"]) }),
]);

export const agentConfig = z.object({
  printers: z.array(printerConfig).max(8),
  logo: logoConfig.nullable().default(null), // eski kayıtlarda yok → null
  scale: scaleConfig,
  autoPrint: z.boolean(), // satıştan sonra fiş kendiliğinden basılır
});

export type PrinterConfig = z.infer<typeof printerConfig>;
export type ScaleConfig = z.infer<typeof scaleConfig>;
export type AgentConfig = z.infer<typeof agentConfig>;
export type LogoConfig = z.infer<typeof logoConfig>;
export const emptyAgentConfig = (): AgentConfig => ({ printers: [], logo: null, scale: { kind: "yok" }, autoPrint: true });

/** Ajan → bulut heartbeat gövdesi. */
export const heartbeatBody = z.object({
  version: z.string().max(20),
  lanIp: z.string().max(45).nullable(),
  port: z.number().int().min(1).max(65535),
  httpsPort: z.number().int().min(1).max(65535).nullable(),
  certExpiresAt: z.iso.datetime({ offset: true }).nullable(),
  printers: z.array(z.object({ id: z.string().max(12), ok: z.boolean().nullable(), error: z.string().max(200).nullable() })).max(8),
  failed: z.number().int().min(0).max(1000),
  scale: z.boolean(),
});
export type Heartbeat = z.infer<typeof heartbeatBody>;

/** Katalogla kasaya inen ajan bilgisi. */
/** LAN merkezi: yalnız adisyon akışı için ajan adresi + bilet (yazdırma yetkisi yok). */
export type LanLink = { url: string; ticket: string };
export type KasaAgent = { url: string; ticket: string; autoPrint: boolean; drawer: boolean; scale: boolean; logo: LogoConfig | null; printers: { id: string; role: string; width: 58 | 80; codepage: "pc857" | "ascii"; brand: "genel" | "epson" | "xprinter" }[] };

export const AGENT_PORT = 17654;
export const LAN_DOMAIN = "lan.cabukpos.com";
