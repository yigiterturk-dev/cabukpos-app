"use client";
// Diyalog: örtü + panel. Form gerekiyorsa gövdede <form id> + alt şeritte <button form=id type=submit>. Esc onClose'u çağırır; örtüye dokunmak kapatmaz (kasada yanlışlıkla dokunup girilen tutar kaybolmasın).
// Erişilebilirlik: açılışta ilk öğeye odak, Tab diyaloğa kilitli (focus trap), kapanışta odak tetikleyiciye döner.
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";

const WIDTH = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-3xl" };

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
function isVisible(el: HTMLElement) {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility === "visible" && !el.closest('[inert], [aria-hidden="true"]');
}
function focusableItems(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}
const subscribeToPortalTarget = () => () => {};
const getPortalTarget = () => typeof document === "undefined" ? null : document.body;
const getServerPortalTarget = () => null;

export function Dialog({ label, title, aside, onClose, closeDisabled = false, size = "md", footer, children }: {
  label: string; title?: ReactNode; aside?: ReactNode; onClose?: () => void; closeDisabled?: boolean; size?: keyof typeof WIDTH; footer?: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const portalTarget = useSyncExternalStore(subscribeToPortalTarget, getPortalTarget, getServerPortalTarget);
  const [visualFrame, setVisualFrame] = useState<{ top: number; bottom: number; maxHeight: number } | null>(null);
  // Capture before child autoFocus runs during commit, so closing returns to the opener.
  const restoreRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const titleId = useId();

  useEffect(() => {
    if (!portalTarget) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () => {
      const top = Math.max(0, Math.min(window.innerHeight - 1, Math.round(viewport.offsetTop)));
      const height = Math.max(1, Math.min(window.innerHeight - top, Math.round(viewport.height)));
      const bottom = Math.max(0, window.innerHeight - top - height);
      const next = { top, bottom, maxHeight: height * 0.92 };
      setVisualFrame((current) => current && current.top === next.top && current.bottom === next.bottom && current.maxHeight === next.maxHeight ? current : next);
    };
    sync();
    window.addEventListener("resize", sync);
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [portalTarget]);

  useEffect(() => {
    if (!portalTarget) return;
    const restoreTarget = restoreRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const currentPadding = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    const panel = ref.current;
    // React autoFocus zaten odakladıysa ona dokunma; değilse kapatma düğmesini atlayıp ilk eyleme geç.
    if (panel && !panel.contains(document.activeElement)) {
      const items = focusableItems(panel);
      const first = items.find((el) => el.getAttribute("aria-label") !== "Pencereyi kapat") ?? items[0] ?? panel;
      first.focus();
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      const canRestore = restoreTarget?.isConnected && isVisible(restoreTarget) && !restoreTarget.matches(":disabled") && (restoreTarget.matches(FOCUSABLE) || restoreTarget.hasAttribute("tabindex"));
      if (canRestore) restoreTarget.focus();
      else {
        const fallback = document.querySelector<HTMLElement>("[role=main], main");
        if (fallback) {
          if (!fallback.hasAttribute("tabindex")) fallback.tabIndex = -1;
          fallback.focus();
        }
      }
    };
  }, [portalTarget]);

  useEffect(() => {
    if (!portalTarget || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (!closeDisabled) onClose(); return; }
      if (e.key !== "Tab") return;
      const panel = ref.current;
      if (!panel) return;
      const items = focusableItems(panel);
      if (!items.length) { e.preventDefault(); return; }
      const firstEl = items[0], lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !panel.contains(active))) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && (active === lastEl || !panel.contains(active))) { e.preventDefault(); firstEl.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [portalTarget, onClose, closeDisabled]);

  if (!portalTarget) return null;

  return createPortal((
    <div role="dialog" aria-modal="true" {...(title !== undefined ? { "aria-labelledby": titleId } : { "aria-label": label })} style={visualFrame ? { top: visualFrame.top, bottom: visualFrame.bottom } : undefined} className="fixed inset-0 z-50 grid place-items-center bg-espresso/45 p-4 backdrop-blur-[2px]">
      <div ref={ref} tabIndex={-1} style={visualFrame ? { maxHeight: visualFrame.maxHeight } : undefined} className={`flex max-h-[92vh] w-full ${WIDTH[size]} flex-col overflow-hidden rounded-[20px] bg-surface shadow-pop outline-none`}>
        {title !== undefined && (
          <div className="flex min-w-0 shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-4">
            <h2 id={titleId} className="min-w-0 flex-1 break-words text-lg font-semibold tracking-tight">{title}</h2>
            <div className="ml-auto flex shrink-0 items-start gap-2">
              {aside && <div>{aside}</div>}
              {onClose && <button type="button" aria-label="Pencereyi kapat" title="Kapat" disabled={closeDisabled} onClick={onClose} className="grid size-12 place-items-center rounded-[10px] text-muted outline-none hover:bg-surface-3 hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-ring/60 disabled:cursor-not-allowed disabled:opacity-40"><X aria-hidden className="size-5" /></button>}
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-6 py-4">{footer}</div>}
      </div>
    </div>
  ), portalTarget);
}
