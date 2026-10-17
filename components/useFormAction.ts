"use client";
// React 19 <form action> gönderimden sonra alanları sıfırlar; hata durumunda kullanıcının girdisi
// kaybolmasın diye gönderimi onSubmit üzerinden yapıyoruz.
import { startTransition, useActionState, useEffect, useId, useRef, type FormEvent } from "react";

export function useFormAction<S>(action: (s: S, f: FormData) => Promise<S>, initial: S) {
  const [state, dispatch, pending] = useActionState<S, FormData>(
    action as (s: Awaited<S>, f: FormData) => Promise<S>,
    initial as Awaited<S>,
  );
  const formRef = useRef<HTMLFormElement | null>(null);
  const errorId = useId();

  useEffect(() => {
    const formState = state as { error?: unknown; field?: unknown };
    if (!formState.error) return;

    const fields = formRef.current?.querySelectorAll<HTMLElement>("[name]");
    const named = typeof formState.field === "string" && formState.field
      ? [...(fields ?? [])].filter((node) => node.getAttribute("name") === formState.field)
      : [];
    const field = named.find((node) => !node.matches('input[type="hidden"]')) ?? named[0];
    let describedField: HTMLElement | null = null;
    let describedId: string | null = null;
    let addedDescription = false;
    let originalInvalid: string | null = null;
    let addedInvalid = false;
    if (field?.matches('input[type="hidden"]')) {
      // Custom controls such as Select submit a hidden input but expose a focusable combobox button.
      const control = field.parentElement?.querySelector<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (control) describedField = control;
    }
    else if (field) describedField = field;

    if (describedField) {
      // ARIA invalid state is not supported on native radio buttons; their group
      // receives the error through the described message and focus stays on the choice.
      if (!describedField.matches('input[type="radio"]')) {
        originalInvalid = describedField.getAttribute("aria-invalid");
        if (originalInvalid !== "true") {
          describedField.setAttribute("aria-invalid", "true");
          addedInvalid = true;
        }
      }
      const alert = formRef.current?.querySelector<HTMLElement>('[role="alert"]');
      if (alert) {
        if (!alert.id) alert.id = `form-error-${errorId}`;
        describedId = alert.id;
        const ids = (describedField.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
        if (!ids.includes(describedId)) {
          describedField.setAttribute("aria-describedby", [...ids, describedId].join(" "));
          addedDescription = true;
        }
      }
      describedField.focus();
      return () => {
        if (!describedField) return;
        if (addedInvalid) {
          if (originalInvalid === null) describedField.removeAttribute("aria-invalid");
          else describedField.setAttribute("aria-invalid", originalInvalid);
        }
        if (describedId && addedDescription) {
          const ids = (describedField.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((id) => id && id !== describedId);
          if (ids.length) describedField.setAttribute("aria-describedby", ids.join(" "));
          else describedField.removeAttribute("aria-describedby");
        }
      };
    }

    // Server errors without a field (for example, credential or network failures) still need
    // a keyboard destination so the user is taken to the explanation after submission.
    const alert = formRef.current?.querySelector<HTMLElement>('[role="alert"]');
    if (alert) {
      alert.tabIndex = -1;
      alert.focus();
    }
  }, [errorId, state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    formRef.current = e.currentTarget;
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, pending, onSubmit };
}
