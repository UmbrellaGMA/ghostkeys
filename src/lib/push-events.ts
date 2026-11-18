/** Eventos que podem gerar notificação push no app do admin. */
export const PUSH_EVENTS = [
  { key: "order_created", label: "Novo pedido criado", hint: "Cliente finalizou o carrinho (ainda sem pagar)" },
  { key: "pix_generated", label: "PIX gerado", hint: "Cliente gerou o QR Code e está pagando" },
  { key: "payment_approved", label: "Pagamento aprovado", hint: "PIX ou cartão confirmado pelo Mercado Pago" },
  { key: "keys_delivered", label: "Compra concluída", hint: "Keys entregues ao cliente" },
  { key: "delivery_failed", label: "Falha na entrega", hint: "Precisa da sua ação: reprocessar ou reembolsar" },
  { key: "payment_rejected", label: "Pagamento recusado", hint: "Cartão recusado pelo emissor" },
  { key: "order_refunded", label: "Reembolso", hint: "Pagamento estornado" },
  { key: "support_message", label: "Mensagem no suporte", hint: "Cliente escreveu no chat da loja" },
] as const;

export type PushEventKey = (typeof PUSH_EVENTS)[number]["key"];

export const PUSH_EVENT_KEYS = PUSH_EVENTS.map((e) => e.key) as PushEventKey[];
