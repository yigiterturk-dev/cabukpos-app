"use client";
import { useEffect } from "react";
import { Button } from "./ui";

export function PrintButton({ label = "Yazdır / PDF" }: { label?: string }) {
  return <Button variant="ghost" onClick={() => window.print()}>{label}</Button>;
}

/** Sayfa açılınca yazdırma penceresini açar (fiş). */
export function AutoPrint() {
  useEffect(() => { window.print(); }, []);
  return null;
}
