"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { StoreSettings } from "@/types";
import { calculateSalePrice } from "@/services/PricingService";
import { formatBRL, parseBRLInput } from "@/lib/money";
import { toast } from "@/components/ui/Toaster";
import { saveSettingsAction } from "../actions";

const toInput = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function SettingsForm({ settings }: { settings: StoreSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState({
    ...settings,
    fixed_markup: toInput(settings.fixed_markup_cents),
    min_price: toInput(settings.min_price_cents),
    default_price: toInput(settings.default_sale_price_cents),
  });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));
  const txt = (k: keyof typeof s) => ({ value: (s[k] as string | null) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never) });
  const bool = (k: keyof typeof s) => ({ checked: Boolean(s[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.checked as never) });

  const preview = (() => {
    try {
      return calculateSalePrice(300, {
        pricing_strategy: s.pricing_strategy,
        default_sale_price_cents: parseBRLInput(s.default_price) ?? 2990,
        margin_percent: Number(s.margin_percent),
        fixed_markup_cents: parseBRLInput(s.fixed_markup) ?? 0,
        min_price_cents: parseBRLInput(s.min_price) ?? 100,
        round_to_90: s.round_to_90,
      });
    } catch {
      return null;
    }
  })();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { fixed_markup, min_price, default_price, id: _id, updated_at: _u, ...rest } = s;
    start(async () => {
      const r = await saveSettingsAction({
        ...rest,
        default_sale_price_cents: parseBRLInput(default_price) ?? 2990,
        fixed_markup_cents: parseBRLInput(fixed_markup) ?? 0,
        min_price_cents: parseBRLInput(min_price) ?? 100,
        store_legal_name: rest.store_legal_name || null,
        store_document: rest.store_document || null,
        support_whatsapp: rest.support_whatsapp || null,
        support_hours: rest.support_hours || null,
        default_activation_region: rest.default_activation_region || null,
        activation_instructions: rest.activation_instructions || null,
      });
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) router.refresh();
    });
  };

  const Check = ({ k, label }: { k: keyof typeof s; label: string }) => (
    <label className="flex items-center justify-between gap-4 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
      <span>{label}</span>
      <input type="checkbox" {...bool(k)} className="size-4 accent-[var(--color-accent)]" />
    </label>
  );

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-2">
      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold text-white sm:col-span-2">Dados da loja</h2>
        <div><label className="label">Nome da loja</label><input className="input" {...txt("store_name")} required /></div>
        <div><label className="label">Razão social</label><input className="input" {...txt("store_legal_name")} /></div>
        <div><label className="label">CNPJ</label><input className="input" {...txt("store_document")} /></div>
        <div><label className="label">E-mail de suporte</label><input type="email" className="input" {...txt("support_email")} /></div>
        <div><label className="label">WhatsApp</label><input className="input" {...txt("support_whatsapp")} placeholder="+55 11 90000-0000" /></div>
        <div><label className="label">Horário de atendimento</label><input className="input" {...txt("support_hours")} /></div>
      </section>

      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold text-white sm:col-span-2">Precificação (preço global)</h2>
        <div className="sm:col-span-2">
          <label className="label">Estratégia</label>
          <select className="input" value={s.pricing_strategy} onChange={(e) => set("pricing_strategy", e.target.value as StoreSettings["pricing_strategy"])}>
            <option value="flat">Preço padrão igual para todos os jogos</option>
            <option value="percent">Margem percentual</option>
            <option value="fixed">Acréscimo fixo em R$</option>
            <option value="percent_plus_fixed">Percentual + acréscimo fixo</option>
          </select>
        </div>
        {s.pricing_strategy === "flat" && (
          <div className="sm:col-span-2"><label className="label">Preço padrão por jogo (R$)</label><input className="input" inputMode="decimal" {...txt("default_price")} /></div>
        )}
        <div><label className="label">Margem (%)</label><input className="input" type="number" step="0.01" min={0} value={s.margin_percent} onChange={(e) => set("margin_percent", e.target.value as unknown as number)} /></div>
        <div><label className="label">Acréscimo fixo (R$)</label><input className="input" inputMode="decimal" {...txt("fixed_markup")} /></div>
        <div><label className="label">Preço mínimo (R$)</label><input className="input" inputMode="decimal" {...txt("min_price")} /></div>
        <div className="flex items-end"><Check k="round_to_90" label="Arredondar para ,90" /></div>
        <p className="rounded-lg bg-accent/10 p-3 text-sm text-fg sm:col-span-2">
          Exemplo: custo ShadowKeys {formatBRL(300)} → preço na loja <strong>{formatBRL(preview)}</strong>. Ao salvar, os jogos sem preço personalizado são recalculados. Pedidos existentes não mudam.
        </p>
      </section>

      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold text-white sm:col-span-2">Promoção por quantidade</h2>
        <div className="sm:col-span-2"><Check k="combo_enabled" label="Ativar promoção (ex.: Leve 3, pague 2)" /></div>
        <div><label className="label">Leve (jogos)</label><input className="input" type="number" min={2} max={20} value={s.combo_size} onChange={(e) => set("combo_size", Number(e.target.value))} /></div>
        <div><label className="label">Grátis por combo</label><input className="input" type="number" min={1} max={19} value={s.combo_free} onChange={(e) => set("combo_free", Number(e.target.value))} /></div>
        <p className="rounded-lg bg-accent/10 p-3 text-sm text-fg sm:col-span-2">
          “Leve {s.combo_size}, pague {Math.max(1, s.combo_size - s.combo_free)}”: a cada {s.combo_size} jogos no carrinho, o(s) {s.combo_free} mais barato(s) sai(em) de graça. O desconto é calculado no servidor e nunca deixa o pedido abaixo do custo.
        </p>
      </section>

      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold text-white sm:col-span-2">Produtos e catálogo</h2>
        <div><label className="label">Plataforma padrão</label><input className="input" {...txt("default_platform")} /></div>
        <div><label className="label">Região de ativação padrão</label><input className="input" {...txt("default_activation_region")} placeholder="Ex.: Brasil" /></div>
        <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted sm:col-span-2">
          O passo a passo de ativação exibido junto da key agora é editado em{" "}
          <Link href="/admin/tutoriais" className="text-accent hover:underline">Tutoriais de ativação</Link>.
        </p>
        <div><label className="label">Quantidade máxima por jogo</label><input className="input" type="number" min={1} max={100} value={s.max_quantity_per_item} onChange={(e) => set("max_quantity_per_item", Number(e.target.value))} /></div>
        <div />
        <Check k="auto_deactivate_missing" label="Desativar jogos que saírem do catálogo" />
        <Check k="import_nsfw" label="Importar jogos adultos (NSFW)" />
      </section>

      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold text-white sm:col-span-2">Pagamento</h2>
        <Check k="pix_enabled" label="PIX habilitado" />
        <Check k="card_enabled" label="Cartão habilitado" />
        <div><label className="label">Validade do PIX (min)</label><input className="input" type="number" min={10} max={1440} value={s.pix_expiration_minutes} onChange={(e) => set("pix_expiration_minutes", Number(e.target.value))} /></div>
        <div><label className="label">Máx. parcelas no cartão</label><input className="input" type="number" min={1} max={12} value={s.max_installments} onChange={(e) => set("max_installments", Number(e.target.value))} /></div>
      </section>

      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold text-white sm:col-span-2">Entrega</h2>
        <Check k="auto_delivery_enabled" label="Entrega automática após aprovação" />
        <div><label className="label">Máx. tentativas automáticas</label><input className="input" type="number" min={1} max={50} value={s.delivery_max_attempts} onChange={(e) => set("delivery_max_attempts", Number(e.target.value))} /></div>
        <div>
          <label className="label">Tamanho do código (ShadowKeys)</label>
          <select className="input" value={s.key_code_length} onChange={(e) => set("key_code_length", e.target.value as StoreSettings["key_code_length"])}>
            <option value="15">15</option><option value="20">20</option><option value="25">25</option><option value="random">Aleatório</option>
          </select>
        </div>
      </section>

      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="font-display text-lg font-bold text-white sm:col-span-2">E-mails</h2>
        <Check k="emails_enabled" label="Enviar e-mails transacionais" />
        <div><label className="label">Responder para (reply-to)</label><input type="email" className="input" {...txt("email_reply_to")} /></div>
        <p className="text-xs text-muted sm:col-span-2">Remetente e chave do provedor são definidos em EMAIL_FROM e RESEND_API_KEY. E-mails de cadastro e recuperação de senha são enviados pelo Supabase Auth (modelos em supabase/templates).</p>
      </section>

      <div className="xl:col-span-2">
        <button type="submit" disabled={pending} className="btn-primary px-8 py-3">
          {pending && <Loader2 className="size-4 animate-spin" />} Salvar configurações
        </button>
      </div>
    </form>
  );
}
