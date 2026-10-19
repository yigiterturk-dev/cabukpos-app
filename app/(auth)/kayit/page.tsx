import { SignupForm } from "../AuthForms";

export default function Kayit() {
  return (
    <>
      <h1 id="main-content" tabIndex={-1} className="mb-2 rounded-sm text-3xl font-semibold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">İşletme hesabı aç</h1>
      <p className="mb-6 text-sm text-muted">14 gün ücretsiz deneme · Kurulum yaklaşık 5 dakika</p>
      <SignupForm />
    </>
  );
}
