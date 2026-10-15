"use client";
// Diyalog: örtü + panel. Form gerekiyorsa gövdede <form id> + alt şeritte <button form=id type=submit>. Esc onClose'u çağırır; örtüye dokunmak kapatmaz (kasada yanlışlıkla dokunup girilen tutar kaybolmasın).
// Erişilebilirlik: açılışta ilk öğeye odak, Tab diyaloğa kilitli (focus trap), kapanışta odak tetikleyiciye döner.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const WIDTH = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-3xl" };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ label, title, aside, onClose, size = "md", footer, children }: {
  label: string; title?: ReactNode; aside?: ReactNode; onClose?: () => void; size?: keyof typeof WIDTH; footer?: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const currentPadding = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    const panel = ref.current;
    // React autoFocus zaten odakladıysa ona dokunma; değilse ilk odaklanabilir öğeye (yoksa panele) geç.
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      first.focus();
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      restoreRef.current?.focus?.();
    };
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
    <div role="dialog" aria-modal="true" {...(title !== undefined ? { "aria-labelledby": titleId } : { "aria-label": label })} className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4 backdrop-blur-[2px]">
      <div ref={ref} tabIndex={-1} className={`flex max-h-[92vh] w-full ${WIDTH[size]} flex-col overflow-hidden rounded-[20px] bg-surface shadow-pop outline-none`}>
        {title !== undefined && (
          <div className="flex min-w-0 shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-4">
            <h2 id={titleId} className="min-w-0 basis-full break-words text-lg font-semibold tracking-tight sm:flex-1 sm:basis-auto">{title}</h2>
            <div className="ml-auto flex shrink-0 items-start gap-2">
              {aside && <div>{aside}</div>}
              {onClose && <button type="button" aria-label="Pencereyi kapat" title="Kapat" onClick={onClose} className="grid size-12 place-items-center rounded-[10px] text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60"><X aria-hidden className="size-5" /></button>}
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
