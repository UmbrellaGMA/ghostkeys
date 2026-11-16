"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { parseBRLInput } from "@/lib/money";
import { toast } from "@/components/ui/Toaster";
import { saveCouponAction } from "../actions";

export function CouponForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const empty = { code: "", discount_type: "percent" as "percent" | "fixed", value: "", min: "", max_uses: "", expires_at: "" };
  const [f, setF] = useState(empty);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = f.discount_type === "percent" ? Number(f.value) : parseBRLInput(f.value);
    start(async () => {
      const r = await saveCouponAction(null, {
        code: f.code,
        discount_type: f.discount_type,
        discount_value: value,
        min_order_cents: f.min ? parseBRLInput(f.min) ?? 0 : 0,
        max_uses: f.max_uses ? Number(f.max_uses) : null,
        expires_at: f.expires_at || null,
        active: true,
      });
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        setF(empty);
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-[1fr_140px_120px_120px_100px_190px_auto] lg:items-end">
      <div><label className="label">Código</label><input className="input uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} required /></div>
      <div>
        <label className="label">Tipo</label>
        <select className="input" value={f.discount_type} onChange={(e) => setF({ ...f, discount_type: e.target.value as "percent" | "fixed" })}>
          <option value="percent">Percentual</option>
          <option value="fixed">Valor fixo</option>
        </select>
      </div>
      <div><label className="label">{f.discount_type === "percent" ? "Desconto %" : "Desconto R$"}</label><input className="input" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required /></div>
      <div><label className="label">Mínimo R$</label><input className="input" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></div>
      <div><label className="label">Máx. usos</label><input className="input" type="number" min={1} value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} /></div>
      <div><label className="label">Expira em</label><input className="input" type="datetime-local" value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} /></div>
      <button disabled={pending} className="btn-primary">{pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Criar</button>
    </form>
  );
}
