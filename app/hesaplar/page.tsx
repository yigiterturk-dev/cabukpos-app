"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Card, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { formatTRY, shortDate, todayISO } from "@/lib/utils";
import { IcPhone, IcPlus, IcX, IcCard, IcWallet } from "@/components/icons";
import { customerBalance, customerLedger } from "@/lib/finance";

export default function HesaplarPage() {
  const { state, addCustomer, addPayment } = useStore();
  const [q, setQ] = useState("");
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(state.customers[0]?.id ?? null);
  
  // Modals
  const [adding, setAdding] = useState(false);
  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");

  const [paymentModal, setPaymentModal] = useState<{ open: boolean; type: "tahsilat" | "borc" }>({ open: false, type: "tahsilat" });
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"nakit" | "kart" | "havale">("nakit");
  const [payNote, setPayNote] = useState("");

  const balanceOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of state.customers) map.set(c.id, customerBalance(state, c.id));
    return map;
  }, [state]);

  const list = useMemo(() => {
    let res = state.customers;
    if (q) {
      const qs = q.toLowerCase();
      res = res.filter((c) => c.name.toLowerCase().includes(qs) || c.phone.includes(qs));
    }
    if (onlyDebtors) res = res.filter((c) => (balanceOf.get(c.id) || 0) < 0);
    return res;
  }, [state.customers, q, onlyDebtors, balanceOf]);

  const selected = state.customers.find((c) => c.id === selectedId);
  const ledger = selected ? customerLedger(state, selected.id) : [];
  const balance = selected ? (balanceOf.get(selected.id) || 0) : 0;

  function handleAdd() {
    if (!nName.trim()) return;
    const c = addCustomer({ name: nName.trim(), phone: nPhone.trim() || "—" });
    setAdding(false);
    setNName("");
    setNPhone("");
    setSelectedId(c.id);
  }

  function handleTransaction() {
    if (!selectedId || !payAmount) return;
    const amount = Math.abs(Number(payAmount));
    if (amount <= 0) return;

    // Tahsilat (ödeme alma) pozitif kaydedilir.
    // Borç (veresiye ekleme) için -amount kaydediyoruz (eğer sistemde addExpense vb. ile debt yoksa).
    // Finans modülündeki müşteri bakiyesi (customerLedger) randevulardan (borç) ve ödemelerden (alacak) oluşuyor.
    // Eğer POS'ta manuel borç girmek istiyorsak, eksi (-) ödeme girebiliriz veya yeni bir fake appointment açabiliriz.
    // Şimdilik sadece tahsilat ekleyelim, borç eklemek fake appointment (açık adisyon) demektir.
    if (paymentModal.type === "borc") {
      alert("Borç/Veresiye eklemek için 'Masalar' sayfasından müşteriye sipariş(adisyon) giriniz.");
      return;
    }

    addPayment({
      date: todayISO(),
      amount: amount,
      method: payMethod,
      customerId: selectedId,
      note: payNote.trim() || "Cari Tahsilat",
      createdAt: new Date().toISOString(),
    });

    setPaymentModal({ open: false, type: "tahsilat" });
    setPayAmount("");
    setPayNote("");
  }

  return (
    <Shell>
      <div className="mx-auto flex h-[calc(100vh-80px)] max-w-[1300px] flex-col gap-5 md:flex-row">
        {/* Sol: Liste */}
        <div className="flex h-full flex-col border-line md:w-[320px] md:border-r md:pr-5 shrink-0">
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle sub="Müşteri & cari kayıtlar">Hesaplar</SectionTitle>
            <button
              onClick={() => setAdding(true)}
              className="rounded-lg bg-surface p-1.5 text-brand shadow-sm ring-1 ring-brand/20 hover:bg-brand hover:text-white transition-colors"
            >
              <IcPlus className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-3 space-y-2">
            <input
              type="search"
              placeholder="İsim veya telefon..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
            <label className="flex items-center gap-2 px-1 text-[13px] font-medium text-ink cursor-pointer">
              <input type="checkbox" checked={onlyDebtors} onChange={(e) => setOnlyDebtors(e.target.checked)} className="accent-brand" />
              Sadece Bakiyesi Ekside (Borçlu) Olanlar
            </label>
          </div>

          <div className="flex-1 overflow-y-auto rounded-2xl bg-surface shadow-sm ring-1 ring-line">
            {list.length === 0 ? (
              <p className="p-4 text-center text-[13px] text-muted">Kayıt bulunamadı.</p>
            ) : (
              <div className="divide-y divide-line">
                {list.map((c) => {
                  const bal = balanceOf.get(c.id) || 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-canvas ${selectedId === c.id ? "bg-brand/5" : ""}`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-[14px] font-semibold ${selectedId === c.id ? "text-brand" : "text-ink"}`}>
                          {c.name.toUpperCase()}
                        </span>
                        <span className="text-[12px] text-muted">{c.phone}</span>
                      </div>
                      {bal !== 0 && (
                        <span className={`text-[13px] font-bold ${bal < 0 ? "text-rose" : "text-emerald-500"}`}>
                          {formatTRY(bal)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sağ: Detay */}
        <div className="flex-1 overflow-y-auto">
          {adding ? (
            <Card className="max-w-[500px] p-6 animate-fade-in">
              <h3 className="mb-4 font-display text-[18px] font-bold text-ink">Yeni Hesap Ekle</h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">Ad Soyad / Firma</label>
                  <input
                    autoFocus
                    value={nName}
                    onChange={(e) => setNName(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[14px] outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">Telefon (Opsiyonel)</label>
                  <input
                    value={nPhone}
                    onChange={(e) => setNPhone(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[14px] outline-none focus:border-brand"
                  />
                </div>
                <div className="mt-4 flex justify-end gap-3">
                  <button onClick={() => setAdding(false)} className="rounded-xl px-4 py-2 text-[14px] font-medium text-muted hover:bg-canvas">
                    İptal
                  </button>
                  <button onClick={handleAdd} className="rounded-xl bg-brand px-5 py-2 text-[14px] font-semibold text-white shadow-md hover:bg-brand-deep">
                    Kaydet
                  </button>
                </div>
              </div>
            </Card>
          ) : selected ? (
            <div className="space-y-6 animate-fade-in">
              {/* Başlık ve Bakiye Özeti */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-line">
                <div>
                  <h2 className="font-display text-[22px] font-bold text-ink">{selected.name.toUpperCase()}</h2>
                  <div className="mt-1 flex items-center gap-2 text-[14px] text-muted">
                    <IcPhone className="h-4 w-4" /> {selected.phone}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-[12px] font-medium uppercase tracking-wide text-muted">Güncel Bakiye</div>
                    <div className={`font-display text-[24px] font-bold ${balance < 0 ? 'text-rose' : balance > 0 ? 'text-emerald-500' : 'text-ink'}`}>
                      {formatTRY(balance)}
                    </div>
                  </div>
                  <button
                    onClick={() => setPaymentModal({ open: true, type: "tahsilat" })}
                    className="rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-white shadow-md hover:bg-ink-light"
                  >
                    Tahsilat Yap
                  </button>
                </div>
              </div>

              {/* Cari Ekstre (Ledger) */}
              <Card className="overflow-hidden">
                <div className="border-b border-line px-5 py-4">
                  <h3 className="font-display text-[16px] font-bold text-ink">Cari Ekstre (Hareketler)</h3>
                </div>
                {ledger.length === 0 ? (
                  <p className="p-6 text-center text-[14px] text-muted">Henüz işlem geçmişi yok.</p>
                ) : (
                  <div className="divide-y divide-line">
                    <div className="hidden grid-cols-[1fr_2fr_1fr_1fr_1fr] gap-4 bg-canvas/50 px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-muted md:grid">
                      <span>Tarih</span>
                      <span>İşlem</span>
                      <span className="text-right text-rose">Borç (-)</span>
                      <span className="text-right text-emerald-500">Alacak (+)</span>
                      <span className="text-right text-brand">Bakiye</span>
                    </div>
                    {ledger.map((row, i) => (
                      <div key={i} className="grid grid-cols-1 gap-2 px-5 py-3 md:grid-cols-[1fr_2fr_1fr_1fr_1fr] md:items-center text-[13.5px]">
                        <div className="font-medium text-muted">{shortDate(row.date)}</div>
                        <div className="font-semibold text-ink">
                          {row.type === "appointment" ? row.description || "Adisyon" : row.description || "Tahsilat"}
                        </div>
                        <div className="text-right font-medium text-rose md:block flex justify-between">
                          <span className="md:hidden text-muted text-[12px]">Borç: </span>
                          {row.debt > 0 ? formatTRY(-row.debt) : "—"}
                        </div>
                        <div className="text-right font-medium text-emerald-500 md:block flex justify-between">
                          <span className="md:hidden text-muted text-[12px]">Alacak: </span>
                          {row.credit > 0 ? formatTRY(row.credit) : "—"}
                        </div>
                        <div className="text-right font-bold text-brand md:block flex justify-between pt-2 md:pt-0 border-t border-line border-dashed md:border-none">
                          <span className="md:hidden text-muted text-[12px]">Bakiye: </span>
                          {formatTRY(row.balanceAfter)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted">Soldan bir hesap seçin</div>
          )}
        </div>
      </div>

      {/* Tahsilat Modalı */}
      {paymentModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-[400px] rounded-2xl bg-surface p-5 shadow-pop animate-in zoom-in-95">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-[17px] font-700 text-ink">Tahsilat Ekle</h3>
              <button onClick={() => setPaymentModal({ open: false, type: "tahsilat" })} className="rounded-lg p-1.5 text-muted hover:bg-canvas">
                <IcX className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">Tutar (₺)</label>
                <input
                  type="number"
                  autoFocus
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[14px] outline-none focus:border-brand"
                  placeholder="Örn: 500"
                />
              </div>
              
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">Ödeme Yöntemi</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPayMethod("nakit")}
                    className={`rounded-lg border py-2 text-[13px] font-medium transition-colors ${payMethod === "nakit" ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-muted"}`}
                  >Nakit</button>
                  <button
                    onClick={() => setPayMethod("kart")}
                    className={`rounded-lg border py-2 text-[13px] font-medium transition-colors ${payMethod === "kart" ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-muted"}`}
                  >Kart</button>
                  <button
                    onClick={() => setPayMethod("havale")}
                    className={`rounded-lg border py-2 text-[13px] font-medium transition-colors ${payMethod === "havale" ? "border-brand bg-brand-soft text-brand-deep" : "border-line text-muted"}`}
                  >Havale</button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink">Açıklama (Opsiyonel)</label>
                <input
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[13px] outline-none focus:border-brand"
                  placeholder="Cari ödemesi..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={handleTransaction} className="w-full rounded-xl bg-ink px-4 py-3 text-[15px] font-semibold text-white shadow-md hover:bg-ink-light">
                Tahsilatı Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
