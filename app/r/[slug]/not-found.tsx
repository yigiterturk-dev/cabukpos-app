// Rota düzeyi 404 — müşteri ölü/yanlış rezervasyon linkine tıkladığında.
//
// ⚠️ BU ROTAYA loading.tsx / Suspense SINIRI EKLEMEYİN.
// Kökte bir loading.tsx varken yanıt akmaya (streaming) 200 ile başlıyor ve
// sonradan çağrılan notFound() HTTP durumunu artık değiştiremiyor: sayfa doğru
// görünüyor ama 200 dönüyor (soft-404). Bu bir kez yaşandı; olmayan her slug
// 200 dönüyordu — arama motoru çöp sayfa indeksler, ölü link fark edilmez.
export default function BookingNotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="max-w-md text-center">
        <p className="font-display text-5xl font-extrabold text-brand">404</p>
        <h1 className="mt-3 text-xl font-bold text-ink">Rezervasyon sayfası bulunamadı</h1>
        <p className="mt-2 text-[15px] text-muted">
          Bu bağlantı artık geçerli değil. İşletmeden güncel randevu linkini isteyin.
        </p>
      </div>
    </main>
  );
}
