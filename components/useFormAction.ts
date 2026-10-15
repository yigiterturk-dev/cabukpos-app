"use client";
// React 19 <form action> gönderimden sonra alanları sıfırlar; hata durumunda kullanıcının girdisi
// kaybolmasın diye gönderimi onSubmit üzerinden yapıyoruz.
import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

export function useFormAction<S>(action: (s: S, f: FormData) => Promise<S>, initial: S) {
  const [state, dispatch, pending] = useActionState<S, FormData>(
    action as (s: Awaited<S>, f: FormData) => Promise<S>,
    initial as Awaited<S>,
  );
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const formState = state as { error?: unknown; field?: unknown };
    if (!formState.error || typeof formState.field !== "string" || !formState.field) return;

    const fields = formRef.current?.querySelectorAll<HTMLElement>("[name]");
    const field = [...(fields ?? [])].find((node) => node.getAttribute("name") === formState.field);
    field?.focus();
  }, [state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    formRef.current = e.currentTarget;
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, pending, onSubmit };
}
