"use client";
// React 19 <form action> gönderimden sonra alanları sıfırlar; hata durumunda kullanıcının girdisi
// kaybolmasın diye gönderimi onSubmit üzerinden yapıyoruz.
import { startTransition, useActionState, type FormEvent } from "react";

export function useFormAction<S>(action: (s: S, f: FormData) => Promise<S>, initial: S) {
  const [state, dispatch, pending] = useActionState<S, FormData>(
    action as (s: Awaited<S>, f: FormData) => Promise<S>,
    initial as Awaited<S>,
  );
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, pending, onSubmit };
}
