import type { LucideIcon } from "lucide-react";
import {
  Armchair, ArrowLeftRight, Boxes, Building2, CalendarClock, ChartColumn, ChefHat,
  CircleHelp, ClipboardList, Contact, CookingPot, CreditCard, Database, Flame, Gift,
  Globe, Handshake, LayoutDashboard, MapPin, Monitor, MonitorSmartphone, Package,
  PackagePlus, Percent, Plug, Printer, Receipt, Settings, ShieldCheck, SlidersHorizontal,
  Star, Store, Tag, Ticket, TrendingUp, UserCog, Warehouse, Clock, Bell,
} from "lucide-react";

export type NavContext = { vertical: "restoran" | "market"; storeCount: number; allStores: boolean };

export type NavLeaf = {
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  only?: "restoran" | "market";
  minStores?: number;
  allStores?: boolean;
};

export type NavHub = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  only?: "restoran" | "market";
  children?: NavLeaf[];
};

export const HUBS: NavHub[] = [
  { href: "/yonetim", label: "Bugün", icon: LayoutDashboard, exact: true },
  { href: "/kasa", label: "Kasa", icon: Monitor },
  {
    href: "/yonetim/menu",
    label: "Menü",
    icon: Package,
    children: [
      { href: "/yonetim/urunler", label: "Ürünler", desc: "Satışa açık ürünleri, fiyatları ve KDV oranlarını yönetin.", icon: Package },
      { href: "/yonetim/fiyatlistesi", label: "Fiyat listeleri", desc: "Farklı satış noktaları için fiyat listesi oluşturun.", icon: Clock },
      { href: "/yonetim/secenekler", label: "Ürün seçenekleri", desc: "Porsiyon, ekstra malzeme gibi seçenekleri tanımlayın.", icon: SlidersHorizontal, only: "restoran" },
      { href: "/yonetim/receteler", label: "Reçeteler", desc: "Ürünün hammaddelerini ve maliyetini tanımlayın.", icon: ChefHat, only: "restoran" },
      { href: "/yonetim/uretim", label: "Üretim", desc: "Hazırlanan ara ürünleri ve üretim kayıtlarını izleyin.", icon: CookingPot, only: "restoran" },
      { href: "/yonetim/etiketler", label: "Raf etiketi", desc: "Fiyat ve raf etiketlerini yazdırın.", icon: Tag },
    ],
  },
  {
    href: "/yonetim/stok",
    label: "Stok",
    icon: Boxes,
    children: [
      { href: "/yonetim/stok", label: "Stok durumu", desc: "Elinizde ne var, ne azaldı — tek ekranda görün.", icon: Boxes },
      { href: "/yonetim/sayim", label: "Sayım ve zayi", desc: "Sayım yapın, fire ve zayi kayıtlarını girin.", icon: ClipboardList },
      { href: "/yonetim/alislar", label: "Alışlar", desc: "Tedarikçiden gelen alışları kaydedin.", icon: PackagePlus },
      { href: "/yonetim/tedarikciler", label: "Tedarikçiler", desc: "Tedarikçi bilgilerini ve iletişimini yönetin.", icon: Handshake },
      { href: "/yonetim/tedarik", label: "Tedarik siparişleri", desc: "Sipariş verin ve eksik gelen ürünleri takip edin.", icon: Receipt },
      { href: "/yonetim/partiler", label: "Son kullanma tarihleri", desc: "Partileri ve SKT'si yaklaşan ürünleri görün.", icon: CalendarClock },
      { href: "/yonetim/transferler", label: "Şubeler arası transfer", desc: "Bir şubeden diğerine ürün gönderin.", icon: ArrowLeftRight, minStores: 2 },
      { href: "/yonetim/depo", label: "Merkez depo", desc: "Tüm şubelerin ortak deposunu yönetin.", icon: Warehouse, allStores: true },
    ],
  },
  {
    href: "/yonetim/satis",
    label: "Satış",
    icon: Armchair,
    only: "restoran",
    children: [
      { href: "/yonetim/salon", label: "Salon ve masalar", desc: "Masa düzenini ve açık adisyonları yönetin.", icon: Armchair },
      { href: "/yonetim/rezervasyonlar", label: "Rezervasyonlar", desc: "Rezervasyon alın ve masaları planlayın.", icon: CalendarClock },
      { href: "/yonetim/istasyonlar", label: "Mutfak ekranları", desc: "Mutfak ve bar ekranlarını yapılandırın.", icon: Flame },
      { href: "/yonetim/bolgeler", label: "Teslimat bölgeleri", desc: "Paket teslimat bölgelerini tanımlayın.", icon: MapPin },
      { href: "/yonetim/platformlar", label: "Pazaryerleri", desc: "Yemek sepeti ve online satış kanallarını bağlayın.", icon: Globe },
      { href: "/yonetim/platform-hesap", label: "Pazaryeri ödemeleri", desc: "Platformlardan gelen hakedişleri kontrol edin.", icon: Receipt },
      { href: "/yonetim/kurye-hesap", label: "Kurye ödemeleri", desc: "Kurye teslimatlarının günlük hesabını görün.", icon: Receipt },
      { href: "/yonetim/markalar", label: "Markalar", desc: "Birden çok markanız varsa ayrı yönetin.", icon: Store },
    ],
  },
  {
    href: "/yonetim/musteriler",
    label: "Müşteriler",
    icon: Contact,
    only: "restoran",
    children: [
      { href: "/yonetim/musteriler", label: "Müşteri listesi", desc: "Müşterileri, adreslerini ve sipariş geçmişini görün.", icon: Contact },
      { href: "/yonetim/sadakat", label: "Puan programı", desc: "Müşterilere puan kazandırın ve kullandırın.", icon: Star, allStores: true },
      { href: "/yonetim/kuponlar", label: "Kuponlar", desc: "İndirim kuponu oluşturun ve takip edin.", icon: Ticket, allStores: true },
      { href: "/yonetim/hediyekarti", label: "Hediye kartı", desc: "Hediye kartı satın ve bakiyesini yönetin.", icon: Gift, allStores: true },
      { href: "/yonetim/buyume", label: "Kampanyalar", desc: "Müşteri kazanma kampanyalarını yönetin.", icon: TrendingUp, only: "restoran" },
    ],
  },
  { href: "/yonetim/raporlar", label: "Raporlar", icon: ChartColumn },
  {
    href: "/yonetim/personel",
    label: "Personel",
    icon: UserCog,
    children: [
      { href: "/yonetim/personel", label: "Personel listesi", desc: "Çalışanları ekleyin ve PIN'lerini yönetin.", icon: UserCog },
      { href: "/yonetim/personel-plan", label: "Vardiya planı", desc: "Kim ne zaman çalışacak, planlayın.", icon: CalendarClock },
      { href: "/yonetim/devam", label: "Giriş / çıkış kayıtları", desc: "Personelin giriş ve çıkış saatlerini görün.", icon: Clock },
      { href: "/yonetim/kullanicilar", label: "Panel kullanıcıları", desc: "Panele giriş yapan hesapları yönetin.", icon: UserCog, allStores: true },
    ],
  },
  {
    href: "/yonetim/ayarlar",
    label: "Ayarlar",
    icon: Settings,
    children: [
      { href: "/yonetim/subeler", label: "Şubeler", desc: "Şube ekleyin ve şube bilgilerini düzenleyin.", icon: Building2 },
      { href: "/yonetim/hq", label: "Zincir yönetimi", desc: "Birden çok şubeyi tek yerden yönetin.", icon: ChartColumn, minStores: 2, allStores: true },
      { href: "/yonetim/cihazlar", label: "Kasa cihazları", desc: "Kasa tabletlerini ve eşleşmelerini yönetin.", icon: MonitorSmartphone },
      { href: "/yonetim/donanim", label: "Yazıcı ve donanım", desc: "Fiş yazıcısı, barkod okuyucu ve diğer donanım.", icon: Printer },
      { href: "/yonetim/mali", label: "Mali belgeler", desc: "e-Arşiv ve mali fiş ayarlarını görün.", icon: Receipt, allStores: true },
      { href: "/yonetim/entegrasyonlar", label: "Bağlantılar", desc: "Dış servis ve API bağlantılarını yönetin.", icon: Plug, allStores: true },
      { href: "/yonetim/abonelik", label: "Abonelik", desc: "Planınızı ve ödeme durumunuzu görün.", icon: CreditCard, allStores: true },
      { href: "/yonetim/franchise", label: "Bayilik", desc: "Bayi şubeleri ve ciro payını takip edin.", icon: Percent, allStores: true },
      { href: "/yonetim/veriler", label: "Veri yönetimi", desc: "Yedek alın, dışa aktarın ve veriyi yönetin.", icon: Database, allStores: true },
      { href: "/yonetim/denetim", label: "İşlem geçmişi", desc: "Kim neyi ne zaman değiştirdi, görün.", icon: ShieldCheck, allStores: true },
      { href: "/yonetim/tercihler", label: "Görünüm ve tercihler", desc: "Tema ve görünüm ayarlarını değiştirin.", icon: Settings },
      { href: "/yonetim/bildirimler", label: "Bildirimler", desc: "Sistem bildirimlerini okuyun.", icon: Bell },
    ],
  },
  { href: "/yonetim/yardim", label: "Yardım", icon: CircleHelp },
];

const allowed = (leaf: { only?: "restoran" | "market"; minStores?: number; allStores?: boolean }, ctx: NavContext) =>
  (!leaf.only || leaf.only === ctx.vertical) && (!leaf.minStores || ctx.storeCount >= leaf.minStores) && (!leaf.allStores || ctx.allStores);

export const visibleChildren = (hub: NavHub, ctx: NavContext) => (hub.children ?? []).filter((leaf) => allowed(leaf, ctx));

export const visibleHubs = (ctx: NavContext) => HUBS.filter((hub) => (!hub.only || hub.only === ctx.vertical) && (!hub.children?.length || visibleChildren(hub, ctx).length > 0));

export const hubForPath = (path: string, ctx: NavContext) => visibleHubs(ctx).find((hub) =>
  hub.exact ? path === hub.href : path === hub.href || path.startsWith(`${hub.href}/`) || visibleChildren(hub, ctx).some((leaf) => path === leaf.href || path.startsWith(`${leaf.href}/`)),
);
