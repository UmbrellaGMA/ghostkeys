"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Lock, ShoppingCart, Tag } from "lucide-react";
import { useValidatedCart } from "@/hooks/useValidatedCart";
import { formatBRL } from "@/lib/money";
import { OrderSummary } from "@/components/cart/OrderSummary";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toaster";

export function CheckoutForm({ email, defaultName }: { email: string; defaultName: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | undefined>();
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const { items, lines, loading, totals, coupon, combo, clear } = useValidatedCart(couponCode);

  if (!items.length && !submitting) {
    return <EmptyState icon={ShoppingCart} title="Seu carrinho está vazio" action={{ label: "Explorar jogos", href: "/jogos" }} />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    if (name.trim().length < 3) return setErrors(["Informe seu nome completo."]);
    if (!accept) return setErrors(["Você precisa aceitar os termos de uso e a política de reembolso."]);
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          customerName: name.trim(),
          couponCode: couponCode ?? "",
          acceptTerms: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = Array.isArray(data.details) ? data.details.map((d: { reason: string }) => d.reason) : [];
        setErrors([data.error ?? "Não foi possível criar o pedido.", ...details]);
        setSubmitting(false);
        if (res.status === 409) router.refresh();
        return;
      }
      clear();
      router.push(`/pedido/${data.orderId}`);
    } catch {
      setErrors(["Falha de conexão. Verifique sua internet e tente novamente."]);
      setSubmitting(false);
    }
  };

  const couponError = coupon && "error" in coupon ? coupon.error : null;

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="card space-y-4 p-6">
          <h2 className="font-display text-lg font-bold text-white">1. Seus dados</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Nome completo</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" required minLength={3} maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="email">E-mail</label>
              <input id="email" value={email} readOnly className="input cursor-not-allowed opacity-70" />
              <p className="mt-1 text-xs text-muted">As keys ficam vinculadas a esta conta.</p>
            </div>
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="font-display text-lg font-bold text-white">2. Itens</h2>
          <ul className="divide-y divide-line">
            {items.map((i) => {
              const l = lines[i.productId];
              return (
                <li key={i.productId} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-fg">{i.name} <span className="text-muted">× {i.quantity}</span></p>
                    <p className="text-xs text-muted">{l?.platform ?? "Steam"} · Região de ativação: <strong className="text-fg">{l?.activation_region ?? "consulte a página do jogo"}</strong></p>
                    {l && !l.available && <p className="text-xs font-semibold text-warning">Indisponível</p>}
                  </div>
                  <span className="font-semibold text-white">{l?.price_cents ? formatBRL(l.price_cents * i.quantity) : "…"}</span>
                </li>
              );
            })}
          </ul>
          <div>
            <label className="label" htmlFor="coupon">Cupom de desconto</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <input id="coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} className="input pl-9 uppercase" placeholder="CÓDIGO" maxLength={40} />
              </div>
              <button type="button" onClick={() => setCouponCode(couponInput.trim() || undefined)} className="btn-secondary">Aplicar</button>
            </div>
            {couponError && <p className="mt-1.5 text-xs text-danger">{couponError}</p>}
            {couponCode && !couponError && totals.couponCents > 0 && <p className="mt-1.5 text-xs text-success">Cupom {couponCode} aplicado.</p>}
            {couponCode && !couponError && !loading && totals.couponCents === 0 && <p className="mt-1.5 text-xs text-warning">Cupom válido, mas o valor mínimo não foi atingido.</p>}
          </div>
        </section>

        <section className="card space-y-3 p-6">
          <h2 className="font-display text-lg font-bold text-white">3. Pagamento</h2>
          <p className="text-sm text-muted">
            Na próxima etapa você escolhe <strong className="text-fg">PIX</strong> ou <strong className="text-fg">cartão de crédito</strong>. O pagamento é processado com segurança pelo Mercado Pago — não armazenamos dados do seu cartão.
          </p>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-fg">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
            <span>
              Li e aceito os <Link href="/paginas/termos" target="_blank" className="text-accent hover:underline">termos de uso</Link> e a{" "}
              <Link href="/paginas/reembolso" target="_blank" className="text-accent hover:underline">política de reembolso</Link>, e conferi a região de ativação dos jogos.
            </span>
          </label>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-40 lg:self-start">
        <OrderSummary
          subtotal={totals.subtotal}
          savings={totals.savings}
          couponCents={totals.couponCents}
          comboCents={totals.comboCents}
          comboMissingUnits={totals.comboMissingUnits}
          combo={combo}
          total={totals.total}
          loading={loading}
        >
          {errors.length > 0 && (
            <div role="alert" className="space-y-1 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-red-200">
              {errors.map((er, i) => (
                <p key={i} className="flex gap-2">
                  {i === 0 && <AlertTriangle className="mt-0.5 size-4 shrink-0" />} {er}
                </p>
              ))}
            </div>
          )}
          <button type="submit" disabled={submitting || loading || totals.hasUnavailable} className="btn-primary w-full py-3.5 text-base">
            {submitting ? <Loader2 className="size-5 animate-spin" /> : <Lock className="size-4" />}
            {submitting ? "Criando pedido..." : "Ir para o pagamento"}
          </button>
          <p className="text-center text-xs text-muted">Preços e disponibilidade são confirmados novamente no servidor.</p>
        </OrderSummary>
        {totals.hasUnavailable && (
          <p className="text-center text-sm text-warning">
            Há itens indisponíveis. <Link href="/carrinho" className="underline" onClick={() => toast("Remova os itens indisponíveis", "info")}>Voltar ao carrinho</Link>
          </p>
        )}
      </aside>
    </form>
  );
}
