import { formatBRL } from "@/lib/money";
import type { Order, OrderItem } from "@/types";

/**
 * Modelos de e-mail transacionais (HTML compatível com clientes de e-mail + versão texto).
 * Nunca incluem a key: o e-mail de entrega leva o cliente à área segura do site.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface TemplateContext {
  storeName: string;
  appUrl: string;
  supportEmail?: string | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(ctx: TemplateContext, title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#09090b;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e6e9f0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121214;border:1px solid #26262b;border-radius:14px;overflow:hidden">
<tr><td style="padding:20px 28px;border-bottom:1px solid #26262b;font-size:20px;font-weight:800;color:#fff"><a href="${esc(ctx.appUrl)}" style="text-decoration:none;color:#fff"><img src="${esc(ctx.appUrl)}/email/logo.png" width="200" height="31" alt="${esc(ctx.storeName)}" style="display:block;border:0;outline:none;width:200px;height:auto;color:#fff;font-size:20px;font-weight:800"></a></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;color:#fff">${esc(title)}</h1>
${body}
${cta ? `<p style="margin:28px 0 8px"><a href="${esc(cta.url)}" style="display:inline-block;background:#6d00d4;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${esc(cta.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #26262b;font-size:12px;color:#8a93a8">
Este é um e-mail automático de ${esc(ctx.storeName)}.${ctx.supportEmail ? ` Dúvidas? Escreva para <a style="color:#b066ff" href="mailto:${esc(ctx.supportEmail)}">${esc(ctx.supportEmail)}</a>.` : ""}
</td></tr></table></td></tr></table></body></html>`;
}

const p = (t: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#c9cfdc">${t}</p>`;

function itemsTable(items: OrderItem[]) {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #26262b;color:#e6e9f0">${esc(i.product_name)} <span style="color:#8a93a8">× ${i.quantity}</span><br><span style="font-size:12px;color:#8a93a8">${esc(i.platform)}${i.activation_region ? ` · Região: ${esc(i.activation_region)}` : ""}</span></td><td align="right" style="padding:8px 0;border-bottom:1px solid #26262b;color:#e6e9f0">${formatBRL(i.unit_price_cents * i.quantity)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;font-size:14px">${rows}</table>`;
}

const orderUrl = (ctx: TemplateContext, order: Order) => `${ctx.appUrl}/conta/pedidos/${order.id}`;

export const templates = {
  welcome(ctx: TemplateContext, name: string): EmailContent {
    return {
      subject: `Bem-vindo(a) à ${ctx.storeName}!`,
      html: layout(ctx, `Olá, ${name || "jogador(a)"}!`, p("Sua conta foi criada. Agora você pode comprar jogos e receber suas keys automaticamente na sua área do cliente."), {
        label: "Explorar jogos",
        url: `${ctx.appUrl}/jogos`,
      }),
      text: `Olá, ${name}! Sua conta na ${ctx.storeName} foi criada. Explore: ${ctx.appUrl}/jogos`,
    };
  },

  orderCreated(ctx: TemplateContext, order: Order, items: OrderItem[]): EmailContent {
    return {
      subject: `Pedido #${order.order_number} recebido`,
      html: layout(
        ctx,
        `Recebemos seu pedido #${order.order_number}`,
        p("Seu pedido foi registrado e está aguardando a confirmação do pagamento.") +
          itemsTable(items) +
          p(`<strong style="color:#fff">Total: ${formatBRL(order.total_cents)}</strong>`),
        { label: "Acompanhar pedido", url: `${ctx.appUrl}/pedido/${order.id}` },
      ),
      text: `Pedido #${order.order_number} recebido. Total ${formatBRL(order.total_cents)}. Acompanhe: ${ctx.appUrl}/pedido/${order.id}`,
    };
  },

  paymentApproved(ctx: TemplateContext, order: Order): EmailContent {
    return {
      subject: `Pagamento aprovado — pedido #${order.order_number}`,
      html: layout(
        ctx,
        "Pagamento aprovado!",
        p(`Confirmamos o pagamento de <strong style="color:#fff">${formatBRL(order.total_cents)}</strong> do pedido #${order.order_number}.`) +
          p("Estamos processando a entrega das suas keys. Você receberá outro e-mail assim que estiverem disponíveis."),
        { label: "Ver pedido", url: orderUrl(ctx, order) },
      ),
      text: `Pagamento do pedido #${order.order_number} aprovado. Acompanhe: ${orderUrl(ctx, order)}`,
    };
  },

  paymentRejected(ctx: TemplateContext, order: Order, reason: string | null): EmailContent {
    return {
      subject: `Pagamento não aprovado — pedido #${order.order_number}`,
      html: layout(
        ctx,
        "Seu pagamento não foi aprovado",
        p(`O pagamento do pedido #${order.order_number} foi recusado${reason ? ` (${esc(reason)})` : ""}.`) +
          p("Nenhum valor foi cobrado. Você pode tentar novamente com outro meio de pagamento."),
        { label: "Tentar novamente", url: `${ctx.appUrl}/pedido/${order.id}` },
      ),
      text: `O pagamento do pedido #${order.order_number} não foi aprovado. Tente novamente: ${ctx.appUrl}/pedido/${order.id}`,
    };
  },

  keysDelivered(ctx: TemplateContext, order: Order, items: OrderItem[]): EmailContent {
    return {
      subject: `Suas keys chegaram! Pedido #${order.order_number}`,
      html: layout(
        ctx,
        "Sua compra foi entregue 🎮",
        p("As keys do seu pedido já estão disponíveis. Por segurança, elas não são enviadas por e-mail: acesse sua área do cliente para visualizá-las.") +
          itemsTable(items) +
          p('<span style="font-size:13px;color:#8a93a8">Confira a região de ativação de cada jogo antes de resgatar.</span>'),
        { label: "Ver minhas keys", url: orderUrl(ctx, order) },
      ),
      text: `Suas keys do pedido #${order.order_number} estão disponíveis em: ${orderUrl(ctx, order)}`,
    };
  },

  passwordReset(ctx: TemplateContext, resetUrl: string): EmailContent {
    return {
      subject: `Redefinição de senha — ${ctx.storeName}`,
      html: layout(ctx, "Redefinir sua senha", p("Recebemos uma solicitação para redefinir sua senha. Se não foi você, ignore este e-mail."), {
        label: "Criar nova senha",
        url: resetUrl,
      }),
      text: `Redefina sua senha: ${resetUrl}`,
    };
  },

  orderRefunded(ctx: TemplateContext, order: Order): EmailContent {
    return {
      subject: `Reembolso do pedido #${order.order_number}`,
      html: layout(
        ctx,
        "Reembolso processado",
        p(`O reembolso de <strong style="color:#fff">${formatBRL(order.total_cents)}</strong> referente ao pedido #${order.order_number} foi solicitado ao Mercado Pago.`) +
          p("O prazo para o valor aparecer depende do meio de pagamento (PIX: em instantes; cartão: até 2 faturas). As keys do pedido foram desativadas."),
        { label: "Ver pedido", url: orderUrl(ctx, order) },
      ),
      text: `Reembolso do pedido #${order.order_number} processado.`,
    };
  },
};
