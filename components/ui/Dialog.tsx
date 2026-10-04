"use client";
// Diyalog: örtü + panel. Form gerekiyorsa gövdede <form id> + alt şeritte <button form=id type=submit>. Esc onClose'u çağırır; örtüye dokunmak kapatmaz (kasada yanlışlıkla dokunup girilen tutar kaybolmasın).
import { useEffect, type ReactNode } from "react";

const WIDTH = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

export function Dialog({ label, title, aside, onClose, size = "md", footer, children }: {
  label: string; title?: ReactNode; aside?: ReactNode; onClose?: () => void; size?: keyof typeof WIDTH; footer?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4 backdrop-blur-[2px]">
      <div className={`flex max-h-[92vh] w-full ${WIDTH[size]} flex-col overflow-hidden rounded-[20px] bg-surface shadow-pop`}>
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
