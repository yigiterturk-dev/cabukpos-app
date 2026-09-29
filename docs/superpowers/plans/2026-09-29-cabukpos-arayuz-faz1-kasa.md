# Arayüz Faz 1 (temel + kasa) Implementation Plan

> Inline uygulanır (ajan yok). Spec: `docs/superpowers/specs/2026-09-29-cabukpos-arayuz-tasarim-dili-design.md`.

**Goal:** Tasarım token'ları + ortak bileşenler kurulup tüm kasa ekranları yeni dile geçer; davranış birebir aynı.

**Architecture:** Yalnız sunum katmanı. `components/ui.tsx` → `components/ui/` klasörü (index yeniden dışa aktarır,
import yolu `@/components/ui` aynı). İkonlar `lucide-react`. Kategori tonu `lib/ui/categoryTone.ts` (saf, birim testli).

**Tech Stack:** Next 16, React 19, Tailwind v4 (`@theme`), lucide-react, node:test, playwright-core E2E.

## Global Constraints

- Beyaz zemin; native `<select>` yok; renk yalnız anlam taşır.
- Erişilebilir adlar değişmez; ürün kutusunun adı `^<Ürün adı> <rakam>` ile başlamalı (e2e `/^Döner \d/`); adet rozeti `aria-hidden`.
- Yeni buton adları "Nakit", "Kart", "Hesap", "Paket", "Salon" gibi mevcut seçici kelimelerini içermez.
- `lib/core`, `lib/offline`, sunucu eylemleri değişmez.

---

### Task 1: Token'lar + `components/ui/` + categoryTone

**Files:** Modify `app/globals.css`; Move `components/ui.tsx` → `components/ui/index.tsx`; Create `components/ui/Dialog.tsx`,
`components/ui/Segmented.tsx`; Create `lib/ui/categoryTone.ts`, `tests/category-tone.test.ts`; `package.json` (+lucide-react).

**Produces:**
- `Button({ variant?: "primary"|"secondary"|"ghost"|"danger"|"success", size?: "sm"|"md"|"lg"|"xl", ...button })`
- `IconButton({ label: string, children, ...button })`
- `Dialog({ label: string, title?: ReactNode, onClose?: () => void, size?: "sm"|"md"|"lg", children, footer?: ReactNode })`
- `Segmented({ items: { key: string; label: ReactNode; pressed: boolean; onClick: () => void }[] })`
- `categoryTone(id: string | null): { dot: string; stripe: string }` — 8 sabit tondan deterministik seçim; null → nötr.

- [ ] Test: `categoryTone("a") === categoryTone("a")`, null → nötr, 50 farklı id en az 6 farklı ton üretir. Çalıştır → FAIL.
- [ ] Uygula, `npm test` → PASS. `npx tsc --noEmit` + `npx eslint components lib` temiz. Commit.

### Task 2: Kasa kabuğu (üst şerit, PIN, eşleme, Center/MoneyForm, gün sonu, fiş)

**Files:** `components/kasa/KasaApp.tsx`, `components/kasa/PinPad.tsx`, `app/kasa/eslestir/page.tsx`, `components/kasa/KasaForms.tsx`.

- [ ] Başlık + bölüm sekmesi tek şeride; İade/Gün sonu/Kasiyer değiştir ikonlu Button (adlar aynı).
- [ ] PinPad 80px tuşlar, dolu nokta = marka; eşleme ve vardiya ekranı kart dili.
- [ ] tsc + eslint + `npm test`; build + e2e m1 → OK. Commit.

### Task 3: Satış ekranı + ödeme + tartı

**Files:** `components/kasa/SaleScreen.tsx`.

- [ ] Ürün kutusu (kategori şeridi, adet rozeti aria-hidden), arama ikonlu, çipler renk noktalı, sepet başlığı/boş durum, Öde 64px.
- [ ] PayDialog: yöntem kutuları ikonlu, "Tam tutar" + yuvarlak banknot tuşları (`quickCash(total)` saf fonksiyon,
  `lib/ui/quickCash.ts` + test: 530,00 → [550, 600, 1000] TL kuruş cinsinden, tam tutar hariç, en fazla 3, artan),
  büyük para üstü paneli.
- [ ] WeighDialog aynı Dialog dili. Test + tsc + eslint; e2e m1 + m3 + m9a → OK. Commit.

### Task 4: Salon, adisyon, hesap, mutfak

**Files:** `SalonScreen.tsx`, `TabScreen.tsx`, `BillScreen.tsx`, `KitchenScreen.tsx`.

- [ ] Token'lara ve Button/Segmented'a geçiş; masa kartı durum şeridi + ikonlu süre/toplam. e2e m5 → OK. Commit.

### Task 5: Paket, yeni paket, kurye, iade, fatura formu

**Files:** `DeliveryBoard.tsx`, `NewDelivery.tsx`, `CourierScreen.tsx`, `RefundScreen.tsx`, `InvoiceForm.tsx`.

- [ ] Token'lara ve ortak bileşenlere geçiş. e2e m6 + m8 → OK. Commit.

### Task 6: Kapanış

- [ ] `npm test` tamamı, e2e m1 m3 m5 m6 m9a son kez; önce/sonra ekran görüntüleri (1366 + 1024).
- [ ] `docs/PROGRESS.md` arayüz bölümü; dal push.
