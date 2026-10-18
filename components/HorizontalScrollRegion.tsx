"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Yalnız taşma olduğunda klavye ile kaydırılabilen, isimlendirilmiş bölge olur. */
export function HorizontalScrollRegion({ label, children, className = "" }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setOverflowing(node.scrollWidth > node.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const removed of record.removedNodes) if (removed instanceof Element) observer.unobserve(removed);
        for (const added of record.addedNodes) if (added instanceof Element) observer.observe(added);
      }
      update();
    });
    mutations.observe(node, { childList: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      role={overflowing ? "region" : undefined}
      aria-label={overflowing ? label : undefined}
      tabIndex={overflowing ? 0 : undefined}
      className={`min-w-0 overflow-x-auto outline-none focus-visible:ring-4 focus-visible:ring-brand-ring/60 ${className}`}
    >
      {children}
    </div>
  );
}
