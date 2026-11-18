import Link from "next/link";
import { BadgePercent, ChevronRight, Users } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { AdminHeader } from "@/components/admin/AdminUI";
import { formatBRL } from "@/lib/money";
import { shiftWeek, weekStartOf } from "@/lib/weeks";
import { affiliateWeeks, listAffiliateCoupons } from "@/services/AffiliateService";

export const metadata = { title: "Afiliados" };

export default async function AdminAffiliates() {
  await requireAdminPage();
  const coupons = await listAffiliateCoupons();
  const thisWeek = weekStartOf();
  const lastWeek = shiftWeek(thisWeek, -1);
  const rows = await Promise.all(
    coupons.map(async (c) => {
      const weeks = await affiliateWeeks(c);
      const get = (w: string) => weeks.find((x) => x.weekStart === w);
      const pending = weeks.filter((w) => !w.paid && w.weekStart < thisWeek).reduce((s, w) => s + w.commissionCents, 0);
      return { c, current: get(thisWeek), last: get(lastWeek), pending };
    }),
  );
  const totalPending = rows.reduce((s, r) => s + r.pending, 0);

  return (
    <>
      <AdminHeader
        title="Afiliados"
        description={
          rows.length
            ? `Comissão a pagar (semanas encerradas): ${formatBRL(totalPending)}`
            : "Cupons com comissão para o dono do cupom. Crie em Cupons marcando “Cupom de afiliado”."
        }
        actions={
          <Link href="/admin/cupons" className="btn-secondary">
            <BadgePercent className="size-4" /> Criar cupom de afiliado
          </Link>
        }
      />

      {rows.length === 0 ? (
        <div className="card grid place-items-center gap-2 p-10 text-center text-muted">
          <Users className="size-8 text-subtle" />
          <p>Nenhum cupom de afiliado ainda.</p>
          <p className="text-xs text-subtle">Em Painel › Cupons, crie ou edite um cupom e marque “Cupom de afiliado”.</p>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map(({ c, current, last, pending }) => (
            <li key={c.id}>
              <Link href={`/admin/afiliados/${c.id}`} className="card flex items-center gap-4 p-4 transition hover:border-accent/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-lg font-bold text-white">{c.affiliate_name}</p>
                  <p className="text-xs text-muted">
                    Cupom <span className="font-mono font-semibold text-fg">{c.code}</span> · comissão {Number(c.commission_percent).toLocaleString("pt-BR")}%
                    {!c.active && <span className="ml-1 text-danger">· inativo</span>}
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-[11px] text-subtle">Esta semana</dt>
                      <dd className="font-semibold text-white">{formatBRL(current?.commissionCents ?? 0)}</dd>
                      <dd className="text-[11px] text-subtle">{current?.sales ?? 0} venda(s)</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-subtle">Semana passada</dt>
                      <dd className="font-semibold text-white">{formatBRL(last?.commissionCents ?? 0)}</dd>
                      <dd className="text-[11px] text-subtle">{last?.paid ? "paga" : `${last?.sales ?? 0} venda(s)`}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-subtle">A pagar</dt>
                      <dd className={pending ? "font-semibold text-warning" : "font-semibold text-success"}>{formatBRL(pending)}</dd>
                    </div>
                  </dl>
                </div>
                <ChevronRight className="size-5 shrink-0 text-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
