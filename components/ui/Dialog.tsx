"use client";
// Diyalog: örtü + panel. Form gerekiyorsa gövdede <form id> + alt şeritte <button form=id type=submit>. Esc onClose'u çağırır; örtüye dokunmak kapatmaz (kasada yanlışlıkla dokunup girilen tutar kaybolmasın).
// Erişilebilirlik: açılışta ilk öğeye odak, Tab diyaloğa kilitli (focus trap), kapanışta odak tetikleyiciye döner.
import { useEffect, useRef, type ReactNode } from "react";

const WIDTH = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ label, title, aside, onClose, size = "md", footer, children }: {
  label: string; title?: ReactNode; aside?: ReactNode; onClose?: () => void; size?: keyof typeof WIDTH; footer?: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    // React autoFocus zaten odakladıysa ona dokunma; değilse ilk odaklanabilir öğeye (yoksa panele) geç.
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      first.focus();
    }
    return () => { restoreRef.current?.focus?.(); };
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const panel = ref.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const firstEl = items[0], lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !panel.contains(active))) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && (active === lastEl || !panel.contains(active))) { e.preventDefault(); firstEl.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4 backdrop-blur-[2px]">
      <div ref={ref} tabIndex={-1} className={`flex max-h-[92vh] w-full ${WIDTH[size]} flex-col overflow-hidden rounded-[20px] bg-surface shadow-pop outline-none`}>
        {title !== undefined && (
          <div className="flex items-baseline justify-between gap-3 border-b border-line px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {aside}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex gap-2 border-t border-line bg-surface-2 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
