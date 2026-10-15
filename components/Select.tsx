"use client";
// Native <select> yerine erişilebilir listbox. Form için gizli input yazar.
import { useEffect, useId, useRef, useState } from "react";

export type Option = { value: string; label: string };

export function Select({
  name,
  ariaLabel,
  options,
  defaultValue = "",
  placeholder = "Seçin",
  onChange,
}: {
  name?: string;
  ariaLabel?: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(v: string) {
    setValue(v);
    setOpen(false);
    onChange?.(v);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!options.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(Math.max(0, options.findIndex((o) => o.value === value)));
        return;
      }
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && options[active]) pick(options[active].value);
      else setOpen(true);
    } else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
        onClick={() => setOpen((o) => {
          if (!o) setActive(Math.max(0, options.findIndex((option) => option.value === value)));
          return !o;
        })}
        onKeyDown={onKey}
        className="flex min-h-11 w-full items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-ring"
      >
        <span title={selected?.label ?? placeholder} className={`min-w-0 truncate ${selected ? "" : "text-muted"}`}>{selected?.label ?? placeholder}</span>
        <span aria-hidden className="text-muted">▾</span>
      </button>
      {open && (
        <ul id={id} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.value);
              }}
              className={`flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm ${i === active ? "bg-surface-2" : ""} ${o.value === value ? "font-medium text-brand" : ""}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
