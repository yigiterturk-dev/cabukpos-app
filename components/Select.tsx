"use client";
// Native <select> yerine erişilebilir listbox. Form için gizli input yazar.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { normalizeSearchText } from "@/lib/core/search";

export type Option = { value: string; label: string };

export function Select({
  id: controlId,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "aria-required": required,
  name,
  ariaLabel,
  options,
  defaultValue = "",
  placeholder = "Seçin",
  disabled = false,
  onChange,
}: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  name?: string;
  ariaLabel?: string;
  options: Option[];
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (v: string) => void;
}) {
  const unavailable = disabled || options.length === 0;
  const [value, setValue] = useState(defaultValue);
  const [menu, setMenu] = useState({ open: false, unavailable });
  if (menu.unavailable !== unavailable) setMenu({ open: false, unavailable });
  const open = menu.open && !unavailable;
  const setOpen = (next: boolean | ((value: boolean) => boolean)) => {
    setMenu((current) => ({ ...current, open: typeof next === "function" ? next(current.open) : next }));
  };
  const [active, setActive] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = useState(256);
  const ref = useRef<HTMLDivElement>(null);
  const typeahead = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const invalidSelection = Boolean(value && options.length > 0 && !options.some((option) => option.value === value));
  const effectiveValue = invalidSelection ? "" : value;
  const selected = options.find((o) => o.value === effectiveValue);
  useEffect(() => () => { if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current); }, []);
  useEffect(() => {
    if (open) return;
    typeahead.current = "";
    if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
    typeaheadTimer.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const listbox = listboxRef.current;
    const option = listbox?.querySelector<HTMLElement>(`[data-option-index="${active}"]`);
    if (!listbox || !option) return;
    if (option.offsetTop < listbox.scrollTop) listbox.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > listbox.scrollTop + listbox.clientHeight) {
      listbox.scrollTop = option.offsetTop + option.offsetHeight - listbox.clientHeight;
    }
  }, [active, open]);

  // Mirror native <select> behavior when a successful server action resets its form.
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const reset = () => {
      setValue(defaultValue);
      setOpen(false);
      setActive(0);
      onChange?.(defaultValue);
    };
    const close = () => setOpen(false);
    form.addEventListener("reset", reset);
    form.addEventListener("submit", close);
    return () => {
      form.removeEventListener("reset", reset);
      form.removeEventListener("submit", close);
    };
  }, [defaultValue, onChange]);

  // Keep keyboard navigation visible when a long list is open. The combobox
  // uses aria-activedescendant rather than moving DOM focus into the options,
  // so browsers do not scroll the active option into view automatically.
  useEffect(() => {
    if (!open || unavailable) return;
    ref.current?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-option-${active}`)}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id, open, unavailable]);

  useEffect(() => {
    if (!open || unavailable) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, unavailable]);

  useLayoutEffect(() => {
    if (!open || unavailable) return;
    const place = () => {
      const button = ref.current?.querySelector<HTMLElement>('button[role="combobox"]');
      if (!button) return;
      const trigger = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      let top = viewport?.offsetTop ?? 0;
      let bottom = top + (viewport?.height ?? window.innerHeight);
      for (let parent = button.parentElement; parent; parent = parent.parentElement) {
        const overflowY = window.getComputedStyle(parent).overflowY;
        if (["auto", "scroll", "hidden", "clip"].includes(overflowY)) {
          const bounds = parent.getBoundingClientRect();
          top = Math.max(top, bounds.top);
          bottom = Math.min(bottom, bounds.bottom);
        }
      }
      const below = Math.max(0, bottom - trigger.bottom - 8);
      const above = Math.max(0, trigger.top - top - 8);
      const desired = Math.min(256, options.length * 44 + 8);
      const upward = below < desired && above > below;
      setDropUp(upward);
      setMenuMaxHeight(Math.max(1, Math.min(256, upward ? above : below)));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, options.length, unavailable]);

  function pick(v: string) {
    if (unavailable) return;
    setValue(v);
    setOpen(false);
    onChange?.(v);
  }

  function onKey(e: React.KeyboardEvent) {
    if (unavailable) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(Math.max(0, options.findIndex((o) => o.value === effectiveValue)));
        return;
      }
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive(e.key === "Home" ? 0 : options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && options[active]) pick(options[active].value);
      else {
        setActive(Math.max(0, options.findIndex((o) => o.value === effectiveValue)));
        setOpen(true);
      }
    } else if (e.key === "Escape" && open) {
      // Let Escape dismiss the listbox first; a surrounding dialog may also
      // listen for Escape globally and should stay open for this keypress.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
    else if (e.key === "Tab") {
      setOpen(false);
    }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.trim()) {
      const character = normalizeSearchText(e.key);
      const previous = typeahead.current;
      const cycling = previous.length > 0 && [...previous].every((part) => part === character);
      const needle = cycling ? character : normalizeSearchText(`${previous}${e.key}`);
      typeahead.current = needle;
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = setTimeout(() => { typeahead.current = ""; }, 700);
      const start = cycling ? active : options.findIndex((o) => o.value === effectiveValue);
      const ordered = [...options.slice(start + 1), ...options.slice(0, start + 1)];
      const match = ordered.find((o) => normalizeSearchText(o.label).startsWith(needle));
      if (match) {
        e.preventDefault();
        setActive(options.indexOf(match));
        setOpen(true);
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={effectiveValue} disabled={unavailable} />}
      <button
        id={controlId}
        type="button"
        role="combobox"
        disabled={unavailable}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open && !unavailable}
        aria-controls={open && !unavailable ? id : undefined}
        aria-activedescendant={open && !unavailable && options[active] ? `${id}-option-${active}` : undefined}
        onClick={() => setOpen((o) => {
          if (unavailable) return false;
          if (!o) setActive(Math.max(0, options.findIndex((option) => option.value === effectiveValue)));
          return !o;
        })}
        onKeyDown={onKey}
        className={`flex min-h-11 w-full items-center justify-between rounded-lg border bg-surface px-3 py-2 text-left text-base outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm ${invalid ? "border-bad focus:border-bad focus:ring-bad/40" : "border-line focus:border-brand focus:ring-brand-ring"}`}
      >
        <span title={selected?.label ?? (options.length ? placeholder : "Seçenek yok")} className={`min-w-0 truncate ${selected ? "" : "text-muted"}`}>{selected?.label ?? (options.length ? placeholder : "Seçenek yok")}</span>
        <span aria-hidden className="text-muted">▾</span>
      </button>
      {open && !unavailable && (
        <ul ref={listboxRef} id={id} role="listbox" style={{ maxHeight: menuMaxHeight }} className={`absolute z-30 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg ${dropUp ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-option-${i}`}
              data-option-index={i}
              role="option"
              aria-selected={o.value === effectiveValue}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.value)}
              className={`flex min-h-11 cursor-pointer items-center px-3 py-2 text-base lg:text-sm ${i === active ? "bg-surface-2" : ""} ${o.value === effectiveValue ? "font-medium text-brand" : ""}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
