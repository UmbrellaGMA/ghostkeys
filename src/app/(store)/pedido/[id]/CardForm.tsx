"use client";
import { useEffect, useState } from "react";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";

let initializedKey: string | null = null;

/**
 * Card Payment Brick do Mercado Pago: os dados do cartão são digitados em campos seguros
 * do Mercado Pago e convertidos em token. Nosso servidor recebe apenas o token.
 */
export function CardForm({
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
  onResult: (r: { status?: string; error?: string }) => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (initializedKey !== publicKey) {
      initMercadoPago(publicKey, { locale: "pt-BR" });
      initializedKey = publicKey;
    }
    setReady(true);
  }, [publicKey]);

  if (!ready) return <div className="skeleton h-80" />;

  return (
    <div className="rounded-xl bg-white p-2">
      <CardPayment
        initialization={{ amount: amountCents / 100, payer: { email } }}
        customization={{ paymentMethods: { maxInstallments, minInstallments: 1 }, visual: { style: { theme: "default" } } }}
        onSubmit={async (formData) => {
          const res = await fetch(`/api/orders/${orderId}/pay`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              method: "card",
              token: formData.token,
              payment_method_id: formData.payment_method_id,
              issuer_id: formData.issuer_id,
              installments: Number(formData.installments),
              payer: { email: formData.payer?.email ?? email, identification: formData.payer?.identification },
            }),
          });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) {
            onResult({ error: d.error ?? "Pagamento não processado." });
            throw new Error(d.error);
          }
          if (d.status === "rejected") onResult({ error: "Pagamento recusado pelo emissor. Verifique os dados ou tente o PIX." });
          else onResult({ status: d.status });
        }}
        onError={() => onResult({ error: "Erro ao carregar o formulário de cartão. Recarregue a página." })}
      />
    </div>
  );
}
