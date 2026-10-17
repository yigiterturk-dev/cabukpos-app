import { SignupForm } from "../AuthForms";

export default function Kayit() {
  return (
    <>
      <h1 id="main-content" tabIndex={-1} className="mb-6 rounded-sm text-3xl font-semibold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">İşletme hesabı aç</h1>
      <SignupForm />
    </>
  );
}
