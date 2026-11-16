import Link from "next/link";
import { Gift } from "lucide-react";
import { formatBRL } from "@/lib/money";

export function OrderSummary({
  subtotal,
  savings,
  couponCents,
  comboCents = 0,
  comboMissingUnits = 0,
  combo,
  total,
  loading,
  children,
}: {
  subtotal: number;
  savings: number;
  couponCents: number;
  comboCents?: number;
  comboMissingUnits?: number;
  combo?: { combo_enabled: boolean; combo_size: number; combo_free: number } | null;
  total: number;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  const comboLabel = combo ? `Leve ${combo.combo_size}, pague ${combo.combo_size - combo.combo_free}` : "Promoção";
  return (
    <div className="card space-y-4 p-6">
      <h2 className="font-display text-lg font-bold text-white">Resumo</h2>
      <dl className="space-y-2.5 text-sm">
        <div className="flex justify-between text-muted">
          <dt>Subtotal</dt>
          <dd className="text-fg">{loading ? "…" : formatBRL(subtotal + savings)}</dd>
        </div>
        {savings > 0 && (
          <div className="flex justify-between text-muted">
            <dt>Descontos de produtos</dt>
            <dd className="text-success">−{formatBRL(savings)}</dd>
          </div>
        )}
        {comboCents > 0 && (
          <div className="flex justify-between text-muted">
            <dt className="flex items-center gap-1.5"><Gift className="size-4 text-accent-2" /> {comboLabel}</dt>
            <dd className="text-success">−{formatBRL(comboCents)}</dd>
          </div>
        )}
        {couponCents > 0 && (
          <div className="flex justify-between text-muted">
            <dt>Cupom</dt>
            <dd className="text-success">−{formatBRL(couponCents)}</dd>
          </div>
        )}
        <div className="flex items-end justify-between border-t border-line pt-3">
          <dt className="font-semibold text-white">Total</dt>
          <dd className="font-display text-2xl font-bold text-white">{loading ? "…" : formatBRL(total)}</dd>
        </div>
      </dl>
      {combo?.combo_enabled && comboMissingUnits > 0 && !loading && (
        <p className="flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-fg">
          <Gift className="mt-0.5 size-4 shrink-0 text-accent-2" />
          <span>
            Adicione mais <strong>{comboMissingUnits}</strong> jogo{comboMissingUnits > 1 ? "s" : ""} e ganhe {combo.combo_free > 1 ? `${combo.combo_free} grátis` : "1 grátis"} ({comboLabel}).{" "}
            <Link href="/jogos" className="font-semibold text-accent hover:underline">Escolher jogos</Link>
          </span>
        </p>
      )}
      {children}
    </div>
  );
}
