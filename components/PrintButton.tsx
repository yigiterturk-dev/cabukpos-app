"use client";
import { Button } from "./ui";

export function PrintButton() {
  return <Button variant="ghost" onClick={() => window.print()}>Yazdır / PDF</Button>;
}
