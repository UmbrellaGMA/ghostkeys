import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseWeek } from "@/lib/weeks";
import { formatBRL } from "@/lib/money";
import { AffiliateReport } from "@/components/affiliate/AffiliateReport";
import { affiliateWeek, affiliateWeeks, getAffiliateCouponByToken } from "@/services/AffiliateService";

export const metadata: Metadata = {
  title: "Painel do afiliado",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

/** Link privado do afiliado: vendas e comissão por semana, sem dados dos clientes. */
export default async function AffiliatePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ semana?: string }> }) {
  const { token } = await params;
  const coupon = await getAffiliateCouponByToken(token);
  if (!coupon) notFound();
  const weekStart = parseWeek((await searchParams).semana);
  const [week, weeks] = await Promise.all([affiliateWeek(coupon, weekStart), affiliateWeeks(coupon)]);

  return (
    <div className="container-page max-w-5xl py-8 sm:py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent-2">Painel do afiliado</p>
      <h1 className="mt-1 font-display text-3xl font-extrabold text-white sm:text-4xl">Olá, {coupon.affiliate_name}!</h1>
      <p className="mt-2 text-muted">
        Vendas com o seu cupom <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono font-bold text-white">{coupon.code}</span> — os clientes ganham{" "}
        {coupon.discount_type === "percent" ? `${coupon.discount_value}%` : formatBRL(coupon.discount_value)} de desconto e você recebe{" "}
        {Number(coupon.commission_percent).toLocaleString("pt-BR")}% de cada venda.
        {!coupon.active && <span className="text-danger"> O cupom está pausado no momento.</span>}
      </p>
      <div className="mt-6">
        <AffiliateReport coupon={coupon} week={week} weeks={weeks} basePath={`/afiliado/${token}`} admin={false} />
      </div>
    </div>
  );
}
