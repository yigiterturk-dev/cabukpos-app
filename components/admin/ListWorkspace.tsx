"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { buttonClass, Dialog, PageHeader } from "@/components/ui";

type WorkspacePanel = { id: string; label: string; title: string; content: ReactNode; size?: "md" | "lg" };

/** Keep lists full-width; editing and occasional forms open on demand. */
export function ListWorkspace({ title, description, panels, editing = false, closeHref, children }: {
  title: string; description: string; panels: WorkspacePanel[]; editing?: boolean;
  closeHref: string; children: ReactNode;
}) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(editing ? panels[0]?.id ?? null : null);
  const panel = panels.find((item) => item.id === active);
  const close = () => {
    setActive(null);
    if (editing) router.push(closeHref, { scroll: false });
  };
  return (
    <>
      <PageHeader title={title} desc={description} actions={panels.map((item, index) => (
        <button key={item.id} type="button" aria-haspopup="dialog" onClick={() => setActive(item.id)} className={buttonClass(index === 0 ? "primary" : "secondary")}>
          {index === 0 && <Plus aria-hidden className="size-4" />}{item.label}
        </button>
      ))} />
      {children}
      {panel && <Dialog label={panel.title} title={panel.title} onClose={close} size={panel.size ?? "md"}>{panel.content}</Dialog>}
    </>
  );
}
