import type { Metadata } from "next";
import Link from "next/link";
import { Clock, KeyRound, Package, ShieldCheck } from "lucide-react";
import { OpenChatButton } from "@/components/support/OpenChatButton";
import { getStoreSettings } from "@/services/CatalogService";

export const metadata: Metadata = {
  title: "Suporte",
  description: "Fale com a equipe GhostKeys pelo chat: dúvidas sobre pedidos, keys e ativação.",
};

/** Página de suporte: o chat abre automaticamente (link dos e-mails de resposta). */
export default async function SupportPage() {
  const s = await getStoreSettings();
  return (
    <div className="container-page max-w-3xl py-10 sm:py-16">
      <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">Fale com o suporte</h1>
      <p className="mt-3 text-muted">
        Converse com nossa equipe pelo chat. A resposta aparece aqui no site e também chega no seu e-mail.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <OpenChatButton />
        <Link href="/paginas/faq" className="btn-secondary">
          Perguntas frequentes
        </Link>
      </div>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {[
          { icon: Package, title: "Pedidos e pagamento", text: "Status do PIX ou cartão, pedido pendente, reembolso." },
          { icon: KeyRound, title: "Keys e ativação", text: "Como ativar na Steam, key inválida ou já usada." },
          { icon: ShieldCheck, title: "Sua conta", text: "Acesso, troca de e-mail e segurança." },
          { icon: Clock, title: "Horário", text: s.support_hours || "Respondemos o mais rápido possível, todos os dias." },
        ].map(({ icon: Icon, title, text }) => (
          <li key={title} className="card flex gap-3 p-4">
            <Icon className="mt-0.5 size-5 shrink-0 text-accent-2" />
            <div>
              <p className="font-semibold text-white">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-subtle">
        Dica: se a dúvida for sobre um pedido, informe o número dele (ex.: #1024). Você encontra em{" "}
        <Link href="/conta/pedidos" className="text-accent-2 underline">
          Meus pedidos
        </Link>
        .
      </p>
    </div>
  );
}
