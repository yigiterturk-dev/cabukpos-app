"use client";
import { useEffect, useRef, useState } from "react";
import { createTransfer, type TransferState } from "@/lib/admin/transfer-actions";
import { useFormAction } from "@/components/useFormAction";
import { Select } from "@/components/Select";
import { Button, Field, Input } from "@/components/ui";
import { formatQty, type StockUnit } from "@/lib/core/stock";
import { MAX_TRANSFER_LINES } from "@/lib/core/transfer";

export type TransferProduct = { id: string; label: string; unit: StockUnit; level: number };

function TransferFields({ products, state, pending, onEdit }: {
  products: TransferProduct[]; state: TransferState; pending: boolean; onEdit: () => void;
}) {
  const [rows, setRows] = useState([{ key: 0, productId: "" }]);
  const nextKey = useRef(1);
  const invalid = (i: number, column: "productId" | "qty") => state.error && state.line === i && state.column === column
    ? { "aria-invalid": true as const, "aria-describedby": "transfer-error" } : {};
  return (
    <fieldset disabled={pending} className="m-0 min-w-0 space-y-4 border-0 p-0">
      <legend className="sr-only">Transfer ürünleri</legend>
      {rows.map((row, i) => {
        const selected = products.find((p) => p.id === row.productId);
        const options = products.filter((p) => p.id === row.productId || !rows.some((r) => r.productId === p.id));
        return (
          <div key={row.key} className="grid min-w-0 grid-cols-1 items-end gap-3 border-b border-line pb-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
            <div className="min-w-0"><Field label={`Ürün ${i + 1}`}><Select name="productId" disabled={pending} options={options.map((p) => ({ value: p.id, label: p.label }))} placeholder="Ürün seçin" onChange={(productId) => {
              setRows((current) => current.map((r) => r.key === row.key ? { ...r, productId } : r));
              onEdit();
            }} aria-required {...invalid(i, "productId")} /></Field></div>
            <Field label={`Miktar ${i + 1}`} hint={selected ? `Kaynakta ${formatQty(selected.level, selected.unit)}${selected.unit === "adet" ? " adet" : ""}` : "Önce ürün seçin"}>
              <Input name="qty" aria-label={`Miktar ${i + 1}`} inputMode={selected?.unit === "adet" ? "numeric" : "decimal"} maxLength={10} required pattern={selected?.unit === "adet" ? String.raw`\d{1,6}` : String.raw`\d{1,6}([.,]\d{1,3})?`} {...invalid(i, "qty")} />
            </Field>
            <Button type="button" variant="secondary" disabled={pending || rows.length === 1} aria-label={`${i + 1}. ürünü kaldır`} onClick={() => { setRows((current) => current.filter((r) => r.key !== row.key)); onEdit(); }}>Kaldır</Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={pending || rows.length >= MAX_TRANSFER_LINES || rows.length >= products.length} onClick={() => {
          const key = nextKey.current++;
          setRows((current) => [...current, { key, productId: "" }]);
          onEdit();
        }}>Ürün ekle</Button>
        <span className="text-xs text-muted">{rows.length} / {MAX_TRANSFER_LINES} ürün · Tüm ürünler birlikte aktarılır.</span>
      </div>
      <Field label="Not (isteğe bağlı)" hint="En fazla 200 karakter"><Input name="note" maxLength={200} placeholder="ör. haftalık takviye" /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Transfer ediliyor…" : "Transfer et"}</Button>
    </fieldset>
  );
}

export function TransferForm({ fromStoreId, toStoreId, products }: {
  fromStoreId: string; toStoreId: string; products: TransferProduct[];
}) {
  const { state, pending, onSubmit } = useFormAction(createTransfer, {} as TransferState);
  const [edited, setEdited] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const displayState = edited || pending ? {} as TransferState : state;
  useEffect(() => {
    if (state.savedAt && !state.error) formRef.current?.querySelector<HTMLInputElement>('input[name="qty"]')?.focus();
  }, [state.savedAt, state.error]);
  return (
    <form ref={formRef} onSubmit={(e) => { setEdited(false); onSubmit(e); }} onChangeCapture={() => setEdited(true)} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="fromStoreId" value={fromStoreId} />
      <input type="hidden" name="toStoreId" value={toStoreId} />
      <TransferFields key={state.savedAt ?? 0} products={products} state={displayState} pending={pending} onEdit={() => setEdited(true)} />
      {pending && <span className="sr-only" role="status" aria-live="polite">Stok transferi kaydediliyor.</span>}
      {displayState.error && <p id="transfer-error" className="break-words text-sm text-bad" role="alert">{displayState.error}</p>}
      {state.savedAt && !edited && !pending && !state.error && <p className="text-sm text-ok" role="status">Transfer kaydedildi; tüm ürünler iki şubenin stoğuna yansıdı.</p>}
    </form>
  );
}
