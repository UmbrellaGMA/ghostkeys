import { BadgePercent, CalendarDays, CheckCircle2, Clock, ShoppingBag, Wallet } from "lucide-react";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { shiftWeek, weekLabel, weekStartOf } from "@/lib/weeks";
import { ORDER_STATUS_LABEL } from "@/types";
import type { AffiliateCoupon, AffiliateWeek, WeekSummary } from "@/services/AffiliateService";
import { WeekPicker } from "./WeekPicker";

const pct = (n: number | string | null) => `${Number(n ?? 0).toLocaleString("pt-BR")}%`;

/**
 * Relatório semanal do cupom de afiliado.
 * `admin`: mostra nome do cliente e link para o pedido. No link do afiliado, nada que identifique o cliente.
 */
export function AffiliateReport({
  coupon,
  week,
  weeks,
  basePath,
  admin,
  actions,
}: {
  coupon: AffiliateCoupon;
  week: AffiliateWeek;
  weeks: WeekSummary[];
  basePath: string;
  admin: boolean;
  actions?: React.ReactNode;
}) {
  const thisWeek = weekStartOf();
  const isCurrent = week.weekStart === thisWeek;
  const next = week.weekStart < thisWeek ? shiftWeek(week.weekStart, 1) : null;
  const pending = weeks.filter((w) => !w.paid && w.weekStart < thisWeek);
  const pendingCents = pending.reduce((s, w) => s + w.commissionCents, 0);
  const allCents = weeks.reduce((s, w) => s + w.commissionCents, 0);

  return (
    <div className="space-y-4">
      <WeekPicker
        basePath={basePath}
        current={week.weekStart}
        currentLabel={weekLabel(week.weekStart)}
        prev={shiftWeek(week.weekStart, -1)}
        next={next}
        options={[
          ...(weeks.some((w) => w.weekStart === thisWeek) ? [] : [{ weekStart: thisWeek, sales: 0, commissionCents: 0, paid: false }]),
          ...weeks,
        ].map((w) => ({ ...w, label: `${weekLabel(w.weekStart)}${w.weekStart === thisWeek ? " (atual)" : ""}` }))}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <CalendarDays className="size-4" /> Segunda a domingo · {weekLabel(week.weekStart)}
        {isCurrent && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-2">semana atual · parcial</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ShoppingBag} label="Vendas" value={String(week.sales)} />
        <Stat icon={Wallet} label="Valor vendido" value={formatBRL(week.revenueCents)} hint="já com o desconto do cupom" />
        <Stat icon={BadgePercent} label={`Comissão (${pct(coupon.commission_percent)})`} value={formatBRL(week.commissionCents)} highlight />
        <div className="card min-w-0 p-3.5 sm:p-4">
          <p className="text-xs text-muted">Status da semana</p>
          {week.payout ? (
            <p className="mt-1.5 flex items-center gap-1.5 font-display text-lg font-bold text-success">
              <CheckCircle2 className="size-5" /> Paga
            </p>
          ) : (
            <p className="mt-1.5 flex items-center gap-1.5 font-display text-lg font-bold text-warning">
              <Clock className="size-5" /> {isCurrent ? "Em andamento" : week.commissionCents ? "A pagar" : "Sem comissão"}
            </p>
          )}
          {week.payout && (
            <p className="mt-0.5 text-xs text-subtle">
              {formatBRL(week.payout.amount_cents)} em {formatDateTime(week.payout.paid_at)}
            </p>
          )}
        </div>
      </div>

      {actions}

      {/* Cálculo pedido a pedido */}
      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 font-display font-bold text-white">Cálculo da semana</h2>
        {week.orders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Nenhuma venda com o cupom {coupon.code} nesta semana.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm [&_td]:px-4 [&_td]:py-2.5 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:text-muted">
              <thead className="border-b border-line">
                <tr>
                  <th>Pedido</th>
                  <th>Pago em</th>
                  {admin && <th>Cliente</th>}
                  <th className="text-right">Valor pago</th>
                  <th className="text-right">%</th>
                  <th className="text-right">Comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {week.orders.map((o) => (
                  <tr key={o.id} className={o.counts ? undefined : "text-subtle line-through decoration-subtle/60"}>
                    <td className="font-semibold text-white">
                      {admin ? (
                        <a href={`/admin/pedidos/${o.id}`} className="hover:underline">
                          #{o.order_number}
                        </a>
                      ) : (
                        `#${o.order_number}`
                      )}
                      {!o.counts && <span className="ml-2 text-xs font-normal no-underline">({ORDER_STATUS_LABEL[o.status].toLowerCase()} · não conta)</span>}
                    </td>
                    <td className="whitespace-nowrap text-muted">{formatDateTime(o.paid_at)}</td>
                    {admin && <td className="max-w-40 truncate">{o.customer_name}</td>}
                    <td className="text-right">{formatBRL(o.total_cents)}</td>
                    <td className="text-right text-muted">{pct(o.percent)}</td>
                    <td className="text-right font-semibold text-white">{formatBRL(o.commission_cents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line bg-surface-2/60 font-semibold">
                <tr>
                  <td colSpan={admin ? 3 : 2}>Total ({week.sales} venda(s))</td>
                  <td className="text-right">{formatBRL(week.revenueCents)}</td>
                  <td />
                  <td className="text-right text-accent-2">{formatBRL(week.commissionCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs text-muted">A pagar (semanas encerradas)</p>
          <p className="mt-1 font-display text-xl font-bold text-white">{formatBRL(pendingCents)}</p>
          <p className="text-xs text-subtle">{pending.length ? `${pending.length} semana(s) em aberto` : "Tudo pago até a semana passada"}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Comissão total desde o início</p>
          <p className="mt-1 font-display text-xl font-bold text-white">{formatBRL(allCents)}</p>
          <p className="text-xs text-subtle">{weeks.reduce((s, w) => s + w.sales, 0)} venda(s) com o cupom {coupon.code}</p>
        </div>
      </div>

      <p className="text-xs text-subtle">
        Comissão de {pct(coupon.commission_percent)} sobre o valor pago em cada pedido com o cupom {coupon.code}, contada pela data do pagamento
        (horário de Brasília). Pedidos reembolsados ou cancelados não geram comissão.
      </p>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, highlight }: { icon: typeof Wallet; label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <div className={`card min-w-0 p-3.5 sm:p-4 ${highlight ? "border-accent/40 bg-accent/10" : ""}`}>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className={`mt-1.5 truncate font-display text-xl font-bold sm:text-2xl ${highlight ? "text-accent-2" : "text-white"}`}>{value}</p>
      {hint && <p className="text-[11px] text-subtle">{hint}</p>}
    </div>
  );
}
