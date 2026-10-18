"use client";
// #47: PWA kurma düğmesi. beforeinstallprompt yakalanınca görünür; zaten kuruluysa (standalone) gizli.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallButton({ label = "Uygulamayı kur" }: { label?: string }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [prompting, setPrompting] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (matchMedia("(display-mode: standalone)").matches) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    addEventListener("beforeinstallprompt", onPrompt);
    return () => removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (!evt) return error ? <span className="max-w-40 text-xs text-cream-muted" role="status" aria-live="polite">Kurulum açılamadı; tarayıcı menüsünü kullanın.</span> : null;
  return (
    <>
      <Button
        disabled={prompting}
        aria-busy={prompting || undefined}
        onClick={async () => {
          if (prompting) return;
          setPrompting(true);
          setError(false);
          try {
            await evt.prompt();
            await evt.userChoice;
            setEvt(null);
          } catch {
            setError(true);
            setEvt(null);
          } finally {
            setPrompting(false);
          }
        }}
        variant="secondary"
      >
        <Download aria-hidden className="size-4" />{prompting ? "Kurulum açılıyor…" : label}
      </Button>
    </>
  );
}
