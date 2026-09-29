import { ForgotForm } from "../AuthForms";

export default function SifremiUnuttum() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Şifremi unuttum</h1>
      <p className="mb-6 text-sm text-muted">Hesabınızın e-postasını yazın; şifre yenileme bağlantısı gönderelim.</p>
      <ForgotForm />
    </>
  );
}
