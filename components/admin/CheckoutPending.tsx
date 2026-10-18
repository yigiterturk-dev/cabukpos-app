"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useFormAction } from "@/components/useFormAction";
import { buttonClass, Field, Input } from "@/components/ui";
import type { CheckoutState } from "@/lib/billing/actions";

export function CheckoutForm({ action, children, label, period, phoneRequired }: {
  action: (state: CheckoutState, formData: FormData) => Promise<CheckoutState>;
  children: ReactNode;
  label: string;
  period: string;
  phoneRequired: boolean;
}) {
  const { state, pending, onSubmit } = useFormAction(action, {} as CheckoutState);
  const formRef = useRef<HTMLFormElement>(null);
  const phoneError = state.field === "phone" && !!state.error;
  useEffect(() => {
    if (!state.error || !state.field) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }, [state.error, state.field]);
  return (
    <form ref={formRef} onSubmit={onSubmit} aria-busy={pending}>
      <fieldset disabled={pending} aria-busy={pending} className="contents">
        <input type="hidden" name="period" value={period} />
        {phoneRequired && <Field label="Cep telefonu" hint="05xx… · en fazla 24 karakter"><Input name="phone" type="tel" inputMode="tel" required minLength={10} maxLength={24} placeholder="05xx xxx xx xx" autoComplete="tel" className="mb-2 w-full" aria-invalid={phoneError || undefined} aria-describedby={phoneError ? "checkout-phone-error" : undefined} /></Field>}
        {state.error && <p id={phoneError ? "checkout-phone-error" : undefined} className="mb-2 break-words text-sm text-bad" role="alert" aria-live="assertive">{state.error}</p>}
        {children}
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${buttonClass("primary", "lg")} w-full`}>
          {pending ? "Ödemeye yönlendiriliyor…" : label}
        </button>
      </fieldset>
      {pending && <span className="sr-only" role="status" aria-live="polite">Ödeme sayfasına yönlendiriliyorsunuz.</span>}
    </form>
  );
}
