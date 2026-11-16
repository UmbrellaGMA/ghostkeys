import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreSettings } from "@/services/CatalogService";
import type { StoreSettings } from "@/types";

type PageDef = { title: string; description: string; render: (s: StoreSettings) => React.ReactNode };

const contact = (s: StoreSettings) => (
  <ul>
    {s.support_email && <li>E-mail: <a className="text-accent" href={`mailto:${s.support_email}`}>{s.support_email}</a></li>}
    {s.support_whatsapp && <li>WhatsApp: <a className="text-accent" href={`https://wa.me/${s.support_whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">{s.support_whatsapp}</a></li>}
    {s.support_hours && <li>Horário: {s.support_hours}</li>}
    {!s.support_email && !s.support_whatsapp && <li>Canais de contato em configuração.</li>}
  </ul>
);

const PAGES: Record<string, PageDef> = {
  sobre: {
    title: "Sobre a loja",
    description: "Conheça nossa loja de keys digitais.",
    render: (s) => (
      <>
        <p>A {s.store_name} é uma loja online de keys digitais de jogos para Steam. Trabalhamos com um fornecedor parceiro autorizado e entregamos as keys de forma automática, logo após a confirmação do pagamento.</p>
        <h2>Como funciona</h2>
        <ul>
          <li>Escolha o jogo e confira a região de ativação.</li>
          <li>Pague com PIX ou cartão pelo Mercado Pago.</li>
          <li>Receba a key na sua área do cliente e um e-mail de confirmação.</li>
        </ul>
        {s.store_legal_name && <p>Razão social: {s.store_legal_name}{s.store_document ? ` — CNPJ ${s.store_document}` : ""}.</p>}
      </>
    ),
  },
  atendimento: {
    title: "Atendimento",
    description: "Fale com nossa equipe.",
    render: (s) => (
      <>
        <p>Teve algum problema com seu pedido? Fale com a gente informando o número do pedido (disponível em <Link className="text-accent" href="/conta/pedidos">Meus pedidos</Link>).</p>
        <h2>Canais</h2>
        {contact(s)}
      </>
    ),
  },
  faq: {
    title: "Perguntas frequentes",
    description: "Dúvidas comuns sobre compras, pagamentos e entrega.",
    render: () => (
      <>
        <h2>Quanto tempo leva a entrega?</h2>
        <p>A entrega é automática: assim que o Mercado Pago confirma o pagamento, a key é gerada e fica disponível na sua área do cliente — normalmente em poucos segundos. PIX costuma ser aprovado na hora; cartões podem levar alguns minutos.</p>
        <h2>Onde vejo minha key?</h2>
        <p>Em Minha conta › Pedidos e keys. Por segurança, a key não é enviada por e-mail.</p>
        <h2>O que é a região de ativação?</h2>
        <p>Algumas keys só podem ser ativadas em determinadas regiões. A região é informada na página de cada jogo e no checkout — confira antes de comprar.</p>
        <h2>O pagamento foi aprovado, mas a key não apareceu.</h2>
        <p>Em raros casos o fornecedor pode estar instável. Seu pedido fica registrado como pago e a entrega é tentada novamente de forma automática. Se não for possível concluir, você é reembolsado.</p>
        <h2>Quais formas de pagamento são aceitas?</h2>
        <p>PIX e cartão de crédito, processados pelo Mercado Pago. Não armazenamos dados de cartão.</p>
      </>
    ),
  },
  termos: {
    title: "Termos de uso",
    description: "Condições de uso da loja.",
    render: (s) => (
      <>
        <p>Ao utilizar a {s.store_name} e realizar compras, você concorda com estes termos.</p>
        <h2>1. Produtos</h2>
        <p>Comercializamos keys digitais de ativação de jogos. Cada produto informa plataforma e região de ativação. É responsabilidade do cliente verificar a compatibilidade antes da compra.</p>
        <h2>2. Conta</h2>
        <p>As keys ficam vinculadas à conta que realizou a compra. Mantenha sua senha em sigilo; não nos responsabilizamos por acessos realizados com suas credenciais.</p>
        <h2>3. Pagamento e entrega</h2>
        <p>Os pagamentos são processados pelo Mercado Pago. A entrega ocorre somente após a confirmação do pagamento. Pedidos não pagos dentro do prazo são cancelados automaticamente.</p>
        <h2>4. Uso das keys</h2>
        <p>As keys destinam-se a uso pessoal. É proibida a revenda ou o uso fraudulento. Pedidos com indícios de fraude podem ser cancelados e as keys revogadas.</p>
        <h2>5. Reembolsos</h2>
        <p>Consulte a <Link className="text-accent" href="/paginas/reembolso">política de reembolso</Link>.</p>
      </>
    ),
  },
  privacidade: {
    title: "Política de privacidade",
    description: "Como tratamos seus dados (LGPD).",
    render: (s) => (
      <>
        <p>Esta política descreve como a {s.store_name} trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
        <h2>Dados coletados</h2>
        <ul>
          <li>Cadastro: nome e e-mail.</li>
          <li>Pedidos: itens comprados, valores e histórico.</li>
          <li>Pagamento: processado pelo Mercado Pago. Não armazenamos números de cartão; o CPF, quando informado, é enviado apenas ao Mercado Pago.</li>
          <li>Segurança: registros de acesso às keys e às operações sensíveis.</li>
        </ul>
        <h2>Finalidade</h2>
        <p>Processar pedidos, entregar produtos, prevenir fraudes, prestar atendimento e cumprir obrigações legais.</p>
        <h2>Seus direitos</h2>
        <p>Você pode solicitar acesso, correção ou exclusão dos seus dados pelos canais de atendimento.</p>
        {contact(s)}
      </>
    ),
  },
  reembolso: {
    title: "Política de reembolso",
    description: "Regras para cancelamento e reembolso.",
    render: () => (
      <>
        <p>Por se tratar de produto digital entregue imediatamente, aplicam-se as regras abaixo, sem prejuízo dos direitos previstos no Código de Defesa do Consumidor.</p>
        <h2>Reembolso integral</h2>
        <ul>
          <li>Pagamento aprovado e entrega não concluída (ex.: indisponibilidade do fornecedor).</li>
          <li>Key com defeito comprovado (inválida ou já utilizada) que não possa ser substituída.</li>
          <li>Arrependimento em até 7 dias, desde que a key não tenha sido resgatada/ativada.</li>
        </ul>
        <h2>Não reembolsável</h2>
        <ul>
          <li>Keys já resgatadas/ativadas.</li>
          <li>Compra de jogo com região incompatível, quando a região estava informada na página do produto.</li>
        </ul>
        <h2>Como solicitar</h2>
        <p>Entre em contato pelo <Link className="text-accent" href="/paginas/atendimento">atendimento</Link> com o número do pedido. O estorno é feito pelo Mercado Pago no mesmo meio de pagamento; ao reembolsar, as keys do pedido são desativadas.</p>
      </>
    ),
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = PAGES[(await params).slug];
  return page ? { title: page.title, description: page.description } : {};
}

export default async function InstitutionalPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = PAGES[(await params).slug];
  if (!page) notFound();
  const settings = await getStoreSettings();
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="mb-6 font-display text-3xl font-bold text-white">{page.title}</h1>
      <article className="card prose-store p-6 sm:p-8">{page.render(settings)}</article>
    </div>
  );
}
