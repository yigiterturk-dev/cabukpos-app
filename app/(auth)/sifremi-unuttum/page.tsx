import { ForgotForm } from "../AuthForms";

export default function SifremiUnuttum() {
  return (
    <>
      <h1 id="main-content" tabIndex={-1} className="mb-2 rounded-sm text-3xl font-semibold tracking-tight outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60">Şifremi unuttum</h1>
      <p className="mb-6 text-sm text-muted">Hesabınızın e-postasını yazın; şifre yenileme bağlantısı gönderelim.</p>
      <ForgotForm />
    </>
  );
}
