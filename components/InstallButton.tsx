"use client";
// #47: PWA kurma düğmesi. beforeinstallprompt yakalanınca görünür; zaten kuruluysa (standalone) gizli.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallButton({ label = "Uygulamayı kur" }: { label?: string }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    if (matchMedia("(display-mode: standalone)").matches) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    addEventListener("beforeinstallprompt", onPrompt);
    return () => removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (!evt) return null;
  return (
    <Button
      onClick={() => {
        void evt.prompt().then(() => evt.userChoice).then(() => setEvt(null));
      }}
      variant="secondary"
    >
      <Download aria-hidden className="size-4" />{label}
    </Button>
  );
}
