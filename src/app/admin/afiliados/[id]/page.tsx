import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Pencil, RefreshCw, Undo2 } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { formatBRL } from "@/lib/money";
import { parseWeek, weekLabel, weekStartOf } from "@/lib/weeks";
import { ActionButton } from "@/components/admin/ActionButton";
import { AffiliateReport } from "@/components/affiliate/AffiliateReport";
import { CopyLink } from "@/components/affiliate/CopyLink";
import { affiliateWeek, affiliateWeeks, getAffiliateCoupon } from "@/services/AffiliateService";
import { markAffiliateWeekPaidAction, regenerateAffiliateLinkAction, unmarkAffiliateWeekPaidAction } from "../../actions";

export const metadata = { title: "Afiliado" };

export default async function AdminAffiliate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semana?: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const coupon = await getAffiliateCoupon(id);
  if (!coupon) notFound();
  const weekStart = parseWeek((await searchParams).semana);
  const [week, weeks] = await Promise.all([affiliateWeek(coupon, weekStart), affiliateWeeks(coupon)]);
  const closed = weekStart < weekStartOf();
  const link = coupon.affiliate_token ? `${appUrl()}/afiliado/${coupon.affiliate_token}` : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/admin/afiliados" className="btn-ghost min-h-10 px-2" aria-label="Voltar aos afiliados">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold text-white sm:text-3xl">{coupon.affiliate_name}</h1>
          <p className="text-sm text-muted">
            Cupom <span className="font-mono font-semibold text-fg">{coupon.code}</span> ·{" "}
            {coupon.discount_type === "percent" ? `${coupon.discount_value}% de desconto` : `${formatBRL(coupon.discount_value)} de desconto`} · comissão{" "}
            {Number(coupon.commission_percent).toLocaleString("pt-BR")}%{!coupon.active && <span className="text-danger"> · cupom inativo</span>}
          </p>
        </div>
        <Link href="/admin/cupons" className="btn-secondary min-h-10 text-xs">
          <Pencil className="size-4" /> Editar cupom
        </Link>
      </div>

      <AffiliateReport
        coupon={coupon}
        week={week}
        weeks={weeks}
        basePath={`/admin/afiliados/${coupon.id}`}
        admin
        actions={
          closed && (week.commissionCents > 0 || week.payout) ? (
            <div className="card flex flex-wrap items-center gap-3 p-4">
              <p className="min-w-0 flex-1 text-sm text-muted">
                {week.payout
                  ? `Comissão da semana ${weekLabel(week.weekStart)} registrada como paga.`
                  : `Depois de pagar ${formatBRL(week.commissionCents)} para ${coupon.affiliate_name}, registre aqui.`}
              </p>
              {week.payout ? (
                <ActionButton
                  action={unmarkAffiliateWeekPaidAction.bind(null, coupon.id, week.weekStart)}
                  confirm="Desfazer o registro de pagamento desta semana?"
                  className="btn-secondary text-xs"
                >
                  <Undo2 className="size-4" /> Desfazer
                </ActionButton>
              ) : (
                <ActionButton
                  action={markAffiliateWeekPaidAction.bind(null, coupon.id, week.weekStart)}
                  confirm={`Marcar ${formatBRL(week.commissionCents)} como pago para ${coupon.affiliate_name}?`}
                  className="btn-primary"
                >
                  <CheckCircle2 className="size-4" /> Marcar comissão como paga
                </ActionButton>
              )}
            </div>
          ) : null
        }
      />

      {link && (
        <section className="card space-y-3 p-4">
          <div>
            <h2 className="font-display font-bold text-white">Link do afiliado</h2>
            <p className="text-sm text-muted">
              Envie para {coupon.affiliate_name}: ele acompanha as vendas e a comissão de cada semana, sem ver dados dos clientes. Não precisa de login.
            </p>
          </div>
          <CopyLink url={link} />
          <ActionButton
            action={regenerateAffiliateLinkAction.bind(null, coupon.id)}
            confirm="Gerar um novo link? O link atual deixa de funcionar."
            className="btn-ghost text-xs"
          >
            <RefreshCw className="size-4" /> Gerar novo link
          </ActionButton>
        </section>
      )}
    </div>
  );
}
