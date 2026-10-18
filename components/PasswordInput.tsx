"use client";
import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui";

export const PasswordInput = forwardRef<HTMLInputElement, ComponentProps<"input">>(function PasswordInput({ className = "", ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <Input {...props} ref={ref} type={visible ? "text" : "password"} className={`pr-12 ${className}`} />
      <button type="button" aria-label={visible ? "Şifreyi gizle" : "Şifreyi göster"} aria-pressed={visible} disabled={props.disabled} onClick={() => setVisible((v) => !v)} className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-40">
        {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </span>
  );
});
