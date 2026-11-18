"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, X } from "lucide-react";
import { parseBRLInput } from "@/lib/money";
import { toast } from "@/components/ui/Toaster";
import type { Coupon } from "@/types";
import { saveCouponAction } from "../actions";

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** ISO → valor do campo datetime-local no fuso do navegador. */
function isoToLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromCoupon(c?: Coupon | null) {
  return {
    code: c?.code ?? "",
    discount_type: (c?.discount_type ?? "percent") as "percent" | "fixed",
    value: c ? (c.discount_type === "percent" ? String(c.discount_value) : centsToInput(c.discount_value)) : "",
    min: c?.min_order_cents ? centsToInput(c.min_order_cents) : "",
    max_uses: c?.max_uses ? String(c.max_uses) : "",
    max_uses_per_user: c?.max_uses_per_user ? String(c.max_uses_per_user) : "",
    expires_at: isoToLocalInput(c?.expires_at ?? null),
  };
}

/** Cria um cupom novo ou edita o informado em `coupon`. */
export function CouponForm({ coupon, onDone }: { coupon?: Coupon | null; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState(() => fromCoupon(coupon));
  const editing = Boolean(coupon);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = f.discount_type === "percent" ? Number(f.value.replace(",", ".")) : parseBRLInput(f.value);
    if (!value || value <= 0) return toast(f.discount_type === "percent" ? "Informe o percentual de desconto" : "Informe o valor do desconto", "error");
    if (f.min && parseBRLInput(f.min) === null) return toast("Valor mínimo inválido", "error");
    start(async () => {
      const r = await saveCouponAction(coupon?.id ?? null, {
        code: f.code,
        discount_type: f.discount_type,
        discount_value: value,
        min_order_cents: f.min ? parseBRLInput(f.min) ?? 0 : 0,
        max_uses: f.max_uses ? Number(f.max_uses) : null,
        max_uses_per_user: f.max_uses_per_user ? Number(f.max_uses_per_user) : null,
        // Converte no navegador: o horário digitado é o do seu fuso (o servidor roda em UTC)
        expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null,
        active: coupon?.active ?? true,
      });
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        if (!editing) setF(fromCoupon(null));
        router.refresh();
        onDone?.();
      }
    });
  };

  return (
    <form onSubmit={submit} className={`card p-4 ${editing ? "border-accent/50 ring-1 ring-accent/30" : ""}`}>
      {editing && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-muted">
            Editando o cupom <span className="font-mono font-semibold text-white">{coupon!.code}</span>
            {coupon!.used_count > 0 && <> · já usado {coupon!.used_count}x</>}
          </p>
          <button type="button" onClick={onDone} className="btn-ghost min-h-9 px-2" aria-label="Cancelar edição">
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[1fr_140px_110px_110px_100px_110px_190px_auto] lg:items-end">
        <div className="col-span-2 sm:col-span-4 lg:col-span-1">
          <label className="label">Código</label>
          <input className="input font-mono uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, "") })} required maxLength={40} />
        </div>
        <div>
          <label className="label">Tipo</label>
          <select className="input" value={f.discount_type} onChange={(e) => setF({ ...f, discount_type: e.target.value as "percent" | "fixed", value: "" })}>
            <option value="percent">Percentual</option>
            <option value="fixed">Valor fixo</option>
          </select>
        </div>
        <div>
          <label className="label">{f.discount_type === "percent" ? "Desconto %" : "Desconto R$"}</label>
          <input className="input" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} required />
        </div>
        <div>
          <label className="label">Mínimo R$</label>
          <input className="input" inputMode="decimal" placeholder="—" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        </div>
        <div>
          <label className="label" title="Total de usos somando todos os clientes">Máx. usos</label>
          <input className="input" type="number" inputMode="numeric" min={1} placeholder="∞" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} />
        </div>
        <div>
          <label className="label" title="Quantas vezes cada cliente pode usar">Por pessoa</label>
          <input className="input" type="number" inputMode="numeric" min={1} max={1000} placeholder="∞" value={f.max_uses_per_user} onChange={(e) => setF({ ...f, max_uses_per_user: e.target.value })} />
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-1">
          <label className="label">Expira em</label>
          <input className="input" type="datetime-local" value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} />
        </div>
        <button disabled={pending} className="btn-primary col-span-2 sm:col-span-4 lg:col-span-1">
          {pending ? <Loader2 className="size-4 animate-spin" /> : editing ? <Save className="size-4" /> : <Plus className="size-4" />} {editing ? "Salvar" : "Criar"}
        </button>
      </div>
      <p className="mt-2 text-xs text-subtle">
        Deixe em branco para não limitar. &quot;Por pessoa&quot; conta pedidos pagos ou aguardando pagamento; cancelados e PIX expirados não contam.
      </p>
    </form>
  );
}
