"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <>
      <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "Gönderiliyor…" : "Doğrulama e-postası gönder"}
      </Button>
      {pending && <span className="sr-only" role="status" aria-live="polite">Doğrulama e-postası gönderiliyor. Lütfen bekleyin.</span>}
    </>
  );
}

export function EmailVerificationForm({ action }: { action: () => void | Promise<void> }) {
  return <form action={action}><SendButton /></form>;
}
