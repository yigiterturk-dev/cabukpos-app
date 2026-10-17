"use client";

import { createContext, useContext, type ReactNode } from "react";

const KasaPreviewContext = createContext(false);

export function KasaPreviewProvider({ children }: { children: ReactNode }) {
  return <KasaPreviewContext.Provider value>{children}</KasaPreviewContext.Provider>;
}

export function useKasaMainProps() {
  return useContext(KasaPreviewContext) ? {} : { id: "kasa-content", role: "main" as const, tabIndex: -1 as const };
}
