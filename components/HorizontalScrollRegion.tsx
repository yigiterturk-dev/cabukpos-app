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
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
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
