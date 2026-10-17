"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";

function CampaignSendFields() {
  const { pending } = useFormStatus();
  return (
    <>
      <fieldset disabled={pending} aria-busy={pending} className="contents">
        <button type="submit" data-testid="send-campaign" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary")} disabled:cursor-wait disabled:opacity-60`}>
          {pending ? "SMS gönderiliyor…" : "Gönder (SMS)"}
        </button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Kampanya SMS mesajları gönderiliyor. Lütfen bekleyin.</span>}
    </>
  );
}

export function CampaignSendForm({ action, campaignId }: { action: (formData: FormData) => void | Promise<void>; campaignId: string }) {
  return <form action={action}><input type="hidden" name="campaignId" value={campaignId} /><CampaignSendFields /></form>;
}
