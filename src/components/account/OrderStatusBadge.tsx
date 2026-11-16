import { ORDER_STATUS_LABEL, type OrderStatus } from "@/types";
import { cn } from "@/lib/utils";

const STYLES: Record<OrderStatus, string> = {
  pending_payment: "bg-warning/15 text-amber-300",
  paid: "bg-accent/15 text-accent",
  processing: "bg-accent/15 text-accent-2",
  delivered: "bg-success/15 text-green-300",
  delivery_failed: "bg-danger/15 text-red-300",
  cancelled: "bg-surface-3 text-muted",
  refunded: "bg-surface-3 text-muted",
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return <span className={cn("badge", STYLES[status], className)}>{ORDER_STATUS_LABEL[status]}</span>;
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  creating: "Criando",
  pending: "Pendente",
  in_process: "Em análise",
  authorized: "Autorizado",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado",
  refunded: "Estornado",
  charged_back: "Chargeback",
  in_mediation: "Em disputa",
  error: "Erro",
};
