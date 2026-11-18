import Link from "next/link";
import { Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { getStoreSettings } from "@/services/CatalogService";
import { Logo } from "@/components/ui/Logo";

export async function Footer() {
  const s = await getStoreSettings();
  const whatsapp = s.support_whatsapp?.replace(/\D/g, "");
  return (
    <footer className="mt-16 border-t border-line bg-surface/50">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo name={s.store_name} />
          <p className="text-sm leading-relaxed text-muted">
            Keys digitais para Steam com pagamento via PIX ou cartão e entrega automática na sua área do cliente.
          </p>
          <p className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-4 text-success" /> Pagamentos processados pelo Mercado Pago
          </p>
        </div>
        <div>
          <h3 className="mb-3 font-display font-bold text-white">Institucional</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-fg" href="/paginas/sobre">Sobre a loja</Link></li>
            <li><Link className="hover:text-fg" href="/paginas/termos">Termos de uso</Link></li>
            <li><Link className="hover:text-fg" href="/paginas/privacidade">Política de privacidade</Link></li>
            <li><Link className="hover:text-fg" href="/paginas/reembolso">Política de reembolso</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-display font-bold text-white">Ajuda</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-fg" href="/suporte">Chat de suporte</Link></li>
            <li><Link className="hover:text-fg" href="/paginas/atendimento">Atendimento</Link></li>
            <li><Link className="hover:text-fg" href="/paginas/faq">Perguntas frequentes</Link></li>
            <li><Link className="hover:text-fg" href="/conta/pedidos">Meus pedidos</Link></li>
            <li><Link className="hover:text-fg" href="/jogos">Catálogo completo</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-display font-bold text-white">Contato</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li>
              <Link className="flex items-center gap-2 hover:text-fg" href="/suporte">
                <MessageCircle className="size-4" /> Chat de suporte
              </Link>
            </li>
            {s.support_email && (
              <li>
                <a className="flex items-center gap-2 hover:text-fg" href={`mailto:${s.support_email}`}>
                  <Mail className="size-4" /> {s.support_email}
                </a>
              </li>
            )}
            {whatsapp && (
              <li>
                <a className="flex items-center gap-2 hover:text-fg" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" /> WhatsApp {s.support_whatsapp}
                </a>
              </li>
            )}
            {s.support_hours && <li>{s.support_hours}</li>}
                      </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {s.store_legal_name ?? s.store_name}
            {s.store_document ? ` · CNPJ ${s.store_document}` : ""}. Todos os direitos reservados.
          </p>
          <p>Steam é uma marca da Valve Corporation. Esta loja não é afiliada à Valve.</p>
        </div>
      </div>
    </footer>
  );
}
