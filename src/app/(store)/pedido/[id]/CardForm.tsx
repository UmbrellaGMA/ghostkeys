"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";

let initializedKey: string | null = null;

type CardResult = { status?: string; error?: string };

interface BrickFormData {
  token: string;
  payment_method_id: string;
  issuer_id?: string | number | null;
  installments: number | string;
  payer?: { email?: string; identification?: { type?: string; number?: string } };
}

interface BrickError {
  type?: "critical" | "non_critical" | string;
  cause?: string;
  message?: string;
}

/**
 * Card Payment Brick do Mercado Pago: os dados do cartão são digitados em campos seguros
 * do Mercado Pago e convertidos em token. Nosso servidor recebe apenas o token.
 *
 * IMPORTANTE: o Brick é desmontado e recriado sempre que `initialization`, `customization`
 * ou qualquer callback muda de identidade. A página do pedido se atualiza sozinha (contador do PIX
 * e consulta de status), então todas as props do Brick são memorizadas e os callbacks leem
 * os valores atuais por ref — assim o formulário não é apagado enquanto o cliente digita.
 */
export const CardForm = memo(function CardForm({
  orderId,
  amountCents,
  email,
  maxInstallments,
  publicKey,
  onResult,
}: {
  orderId: string;
  amountCents: number;
  email: string;
  maxInstallments: number;
  publicKey: string;
  onResult: (r: CardResult) => void;
}) {
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const latest = useRef({ orderId, email, onResult });
  latest.current = { orderId, email, onResult };

  useEffect(() => {
    if (initializedKey !== publicKey) {
      initMercadoPago(publicKey, { locale: "pt-BR" });
      initializedKey = publicKey;
    }
    setReady(true);
  }, [publicKey]);

  const initialization = useMemo(() => ({ amount: amountCents / 100, payer: { email } }), [amountCents, email]);
  const customization = useMemo(
    () => ({
      paymentMethods: { maxInstallments: Math.max(1, maxInstallments), minInstallments: 1 },
      visual: { style: { theme: "default" as const } },
    }),
    [maxInstallments],
  );

  const onReady = useCallback(() => setLoaded(true), []);

  const onSubmit = useCallback(async (formData: BrickFormData) => {
    const { orderId: id, email: fallbackEmail, onResult: report } = latest.current;
    let res: Response;
    try {
      res = await fetch(`/api/orders/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "card",
          token: formData.token,
          payment_method_id: formData.payment_method_id,
          issuer_id: formData.issuer_id ?? null,
          installments: Number(formData.installments) || 1,
          payer: { email: formData.payer?.email || fallbackEmail, identification: formData.payer?.identification },
        }),
      });
    } catch {
      report({ error: "Sem conexão. Verifique sua internet e tente novamente." });
      throw new Error("network");
    }
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      report({ error: d.error ?? "Pagamento não processado." });
      throw new Error(d.error ?? "payment_failed");
    }
    if (d.status === "rejected") report({ error: "Pagamento recusado pelo emissor. Verifique os dados ou tente o PIX." });
    else report({ status: d.status });
  }, []);

  const onError = useCallback((error: BrickError) => {
    // Erros "non_critical" (ex.: campo inválido) já são exibidos pelo próprio Brick.
    if (error?.type === "non_critical") return;
    console.error("[CardPayment Brick]", error);
    latest.current.onResult({ error: "Erro ao carregar o formulário de cartão. Recarregue a página ou use o PIX." });
  }, []);

  if (!ready) return <div className="skeleton h-80" />;

  return (
    <div className="relative min-h-80 rounded-xl bg-white p-2">
      {!loaded && <div className="skeleton absolute inset-2 rounded-lg" aria-hidden />}
      <CardPayment initialization={initialization} customization={customization} onReady={onReady} onSubmit={onSubmit} onError={onError} />
    </div>
  );
});
