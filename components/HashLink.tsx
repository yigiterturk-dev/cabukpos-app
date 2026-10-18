"use client";

import type { MouseEvent, ReactNode } from "react";

export function HashLink({ href, className, children }: { href: `#${string}`; className?: string; children: ReactNode }) {
  const focusHeading = (event: MouseEvent<HTMLAnchorElement>) => {
    const id = decodeURIComponent(event.currentTarget.hash.slice(1));
    requestAnimationFrame(() => document.getElementById(id)?.querySelector<HTMLElement>("h1, h2")?.focus({ preventScroll: true }));
  };

  return <a href={href} className={className} onClick={focusHeading}>{children}</a>;
}
