"use client";
import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import type { Coupon } from "@/types";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { Table } from "@/components/admin/AdminUI";
import { Toggle } from "@/components/admin/ActionButton";
import { toggleCouponAction } from "../actions";
import { CouponForm } from "./CouponForm";

/** Formulário (criar/editar) + lista de cupons. */
export function CouponsManager({ coupons }: { coupons: Coupon[] }) {
  const [editing, setEditing] = useState<Coupon | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const edit = (c: Coupon) => {
    setEditing(c);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div ref={top} className="scroll-mt-20">
        <CouponForm key={editing?.id ?? "new"} coupon={editing} onDone={() => setEditing(null)} />
      </div>
      <div className="mt-6">
        <Table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Desconto</th>
              <th>Pedido mínimo</th>
              <th>Usos</th>
              <th>Por pessoa</th>
              <th>Expira</th>
              <th>Ativo</th>
              <th className="w-0">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => {
              const expired = Boolean(c.expires_at && new Date(c.expires_at) <= new Date());
              return (
                <tr key={c.id} className={editing?.id === c.id ? "bg-accent/10" : undefined}>
                  <td className="font-mono font-semibold text-white">{c.code}</td>
                  <td>{c.discount_type === "percent" ? `${c.discount_value}%` : formatBRL(c.discount_value)}</td>
                  <td>{c.min_order_cents ? formatBRL(c.min_order_cents) : "—"}</td>
                  <td>
                    {c.used_count}
                    {c.max_uses ? ` / ${c.max_uses}` : ""}
                  </td>
                  <td>{c.max_uses_per_user ? `${c.max_uses_per_user}x` : "Ilimitado"}</td>
                  <td className={expired ? "text-danger" : "text-muted"}>
                    {c.expires_at ? `${expired ? "Expirou " : ""}${formatDateTime(c.expires_at)}` : "Sem validade"}
                  </td>
                  <td>
                    <Toggle checked={c.active} label="Ativo" action={toggleCouponAction.bind(null, c.id)} />
                  </td>
                  <td>
                    <button type="button" onClick={() => edit(c)} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
                      <Pencil className="size-3.5" /> Editar
                    </button>
                  </td>
                </tr>
              );
            })}
            {!coupons.length && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  Nenhum cupom criado.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </>
  );
}
