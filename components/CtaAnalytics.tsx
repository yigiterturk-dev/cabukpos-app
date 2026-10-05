"use client";

import { useEffect } from "react";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

function track(name: string, cta: string) {
  const target = window as AnalyticsWindow;
  if (typeof target.gtag === "function") target.gtag("event", name, { cta });
  else if (Array.isArray(target.dataLayer)) target.dataLayer.push({ event: name, cta });
}

export default function CtaAnalytics() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const cta = target.closest<HTMLElement>("[data-cta]")?.dataset.cta;
      if (cta) track("cta_click", cta);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
