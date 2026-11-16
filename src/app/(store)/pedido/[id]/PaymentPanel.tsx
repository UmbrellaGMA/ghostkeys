"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { CheckCircle2, Clock, Copy, CreditCard, KeyRound, Loader2, QrCode, XCircle } from "lucide-react";
import type { ActivationTutorial as Tutorial, OrderStatus } from "@/types";
import { KeyReveal } from "@/components/account/KeyReveal";
import { ActivationTutorial } from "@/components/account/ActivationTutorial";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/Toaster";

const CardForm = dynamic(() => import("./CardForm").then((m) => m.CardForm), {
  ssr: false,
  loading: () => <div className="skeleton h-80" />,
});

interface PixData {
  qrCode: string | null;
  qrCodeBase64: string | null;
  expiresAt: string | null;
}

interface Props {
  orderId: string;
  initialStatus: OrderStatus;
  totalCents: number;
  email: string;
  pixEnabled: boolean;
  cardEnabled: boolean;
  maxInstallments: number;
  publicKey: string;
  keyCount: number;
  tutorials: Tutorial[];
}

const REJECT_MESSAGES: Record<string, string> = {
  cc_rejected_insufficient_amount: "Saldo/limite insuficiente.",
  cc_rejected_bad_filled_security_code: "Código de segurança inválido.",
  cc_rejected_bad_filled_date: "Data de validade inválida.",
  cc_rejected_bad_filled_other: "Revise os dados do cartão.",
  cc_rejected_call_for_authorize: "Autorize o pagamento junto ao emissor do cartão.",
  cc_rejected_card_disabled: "Cartão desabilitado. Contate o emissor.",
  cc_rejected_high_risk: "Pagamento recusado por segurança. Tente o PIX.",
  cc_rejected_duplicated_payment: "Pagamento duplicado detectado.",
};

export function PaymentPanel(props: Props) {
  const [status, setStatus] = useState<OrderStatus>(props.initialStatus);
  const [method, setMethod] = useState<"pix" | "card">(props.pixEnabled ? "pix" : "card");
  const [pix, setPix] = useState<PixData | null>(null);
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/orders/${props.orderId}/status`, { cache: "no-store" });
    if (!res.ok) return;
    const d = await res.json();
    setStatus(d.status);
    if (d.pix) setPix(d.pix);
    if (d.paymentStatus === "rejected" && d.status === "pending_payment") {
      setError(REJECT_MESSAGES[d.paymentStatusDetail] ?? "Pagamento recusado. Tente novamente ou use outro meio de pagamento.");
    }
  }, [props.orderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling enquanto aguarda pagamento/entrega
  useEffect(() => {
    if (!["pending_payment", "paid", "processing"].includes(status)) return;
    const interval = status === "pending_payment" && !pix ? 15000 : 4000;
    const t = setInterval(refresh, interval);
    return () => clearInterval(t);
  }, [status, pix, refresh]);

  useEffect(() => {
    if (!pix?.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pix?.expiresAt]);

  const generatePix = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${props.orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "pix", cpf }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Não foi possível gerar o PIX");
      setPix({ qrCode: d.qrCode, qrCodeBase64: d.qrCodeBase64, expiresAt: d.expiresAt });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!pix?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pix.qrCode);
      toast("Código PIX copiado!");
    } catch {
      toast("Não foi possível copiar. Selecione o código manualmente.", "error");
    }
  };

  // ───── Estados finais / intermediários ─────
  if (status === "delivered") {
    return (
      <div className="space-y-6">
        <div className="card p-6">
          <div className="mb-5 flex items-center gap-3">
            <CheckCircle2 className="size-8 shrink-0 text-success" />
            <div>
              <h2 className="font-display text-2xl font-bold text-white">Compra concluída!</h2>
              <p className="text-sm text-muted">Sua key está abaixo. Ela também fica salva em Minha conta › Pedidos.</p>
            </div>
          </div>
          <KeyReveal orderId={props.orderId} keyCount={props.keyCount} autoLoad />
        </div>
        {props.tutorials.map((t) => (
          <div key={t.id} className="card p-6">
            <ActivationTutorial tutorial={t} />
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          <Link href={`/conta/pedidos/${props.orderId}`} className="btn-secondary">
            <KeyRound className="size-4" /> Ver detalhes do pedido
          </Link>
          <Link href="/jogos" className="btn-secondary">Continuar comprando</Link>
        </div>
      </div>
    );
  }
  if (status === "paid" || status === "processing") {
    return (
      <StatusCard icon={<Loader2 className="size-10 animate-spin text-accent" />} title="Pagamento aprovado!" text="Estamos gerando suas keys. Isso costuma levar poucos segundos — você também receberá um e-mail.">
        <Link href={`/conta/pedidos/${props.orderId}`} className="btn-secondary">Acompanhar pedido</Link>
      </StatusCard>
    );
  }
  if (status === "delivery_failed") {
    return (
      <StatusCard icon={<Clock className="size-10 text-warning" />} title="Pagamento aprovado — entrega em análise" text="Houve um problema temporário com o fornecedor. Nossa equipe já foi notificada e vai concluir a entrega ou reembolsar você.">
        <Link href="/paginas/atendimento" className="btn-secondary">Falar com o atendimento</Link>
      </StatusCard>
    );
  }
  if (status === "cancelled" || status === "refunded") {
    return (
      <StatusCard
        icon={<XCircle className="size-10 text-danger" />}
        title={status === "cancelled" ? "Pedido cancelado" : "Pedido reembolsado"}
        text={status === "cancelled" ? "O prazo de pagamento expirou ou o pedido foi cancelado." : "O valor foi estornado pelo Mercado Pago."}
      >
        <Link href="/jogos" className="btn-primary">Voltar à loja</Link>
      </StatusCard>
    );
  }

  const remaining = pix?.expiresAt ? Math.max(0, new Date(pix.expiresAt).getTime() - now) : null;

  return (
    <div className="card p-6">
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface-2 p-1">
        {props.pixEnabled && (
          <button onClick={() => setMethod("pix")} className={cn("btn", method === "pix" ? "bg-accent text-white" : "text-muted hover:text-fg")}>
            <QrCode className="size-4" /> PIX
          </button>
        )}
        {props.cardEnabled && (
          <button onClick={() => setMethod("card")} className={cn("btn", method === "card" ? "bg-accent text-white" : "text-muted hover:text-fg", !props.pixEnabled && "col-span-2")}>
            <CreditCard className="size-4" /> Cartão de crédito
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-red-200">
          <XCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      )}

      {method === "pix" && (
        <div>
          {!pix?.qrCode ? (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Gere o QR Code e pague pelo app do seu banco. A confirmação é automática e leva poucos segundos.
              </p>
              <div className="max-w-xs">
                <label className="label" htmlFor="cpf">CPF do pagador (opcional)</label>
                <input id="cpf" inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value.replace(/[^\d.-]/g, "").slice(0, 14))} placeholder="000.000.000-00" className="input" />
                <p className="mt-1 text-xs text-muted">Usado apenas pelo Mercado Pago para emissão do PIX; não armazenamos.</p>
              </div>
              <button onClick={generatePix} disabled={loading} className="btn-primary py-3">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                Gerar PIX de {formatBRL(props.totalCents)}
              </button>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
              {pix.qrCodeBase64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code PIX" className="order-last mx-auto size-[200px] rounded-xl bg-white p-2 sm:order-none sm:size-[220px]" />
              )}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin text-accent" />
                  <span className="text-fg">Aguardando pagamento...</span>
                  {remaining !== null && (
                    <span className="ml-auto rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs text-muted">
                      expira em {String(Math.floor(remaining / 60000)).padStart(2, "0")}:{String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}
                    </span>
                  )}
                </div>
                <div className="order-1 sm:order-none">
                  <label className="label" htmlFor="pix-code">PIX copia e cola</label>
                  <textarea id="pix-code" readOnly value={pix.qrCode} rows={4} className="input resize-none font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                </div>
                <button onClick={copy} className="btn-primary w-full py-3.5 text-base sm:py-2.5 sm:text-sm">
                  <Copy className="size-4" /> Copiar código PIX
                </button>
                <p className="text-center text-xs text-muted sm:hidden">Pagando pelo celular? Copie o código e cole na opção “PIX Copia e Cola” do app do seu banco.</p>
                <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
                  <li>Abra o app do seu banco e escolha pagar com PIX.</li>
                  <li>Escaneie o QR Code ou cole o código.</li>
                  <li>Confirme o pagamento — esta página atualiza sozinha.</li>
                </ol>
                {remaining === 0 && (
                  <button onClick={generatePix} disabled={loading} className="btn-secondary w-full">Gerar novo PIX</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {method === "card" && props.cardEnabled && (
        <CardForm
          orderId={props.orderId}
          amountCents={props.totalCents}
          email={props.email}
          maxInstallments={props.maxInstallments}
          publicKey={props.publicKey}
          onResult={(r) => {
            if (r.error) setError(r.error);
            else setError(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusCard({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-4 p-10 text-center">
      {icon}
      <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
      <p className="max-w-md text-sm text-muted">{text}</p>
      <div className="flex gap-3">{children}</div>
    </div>
  );
}
