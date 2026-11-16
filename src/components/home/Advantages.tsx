import { BadgeCheck, Headphones, KeyRound, Lock, QrCode, Zap } from "lucide-react";

const ITEMS = [
  { icon: Zap, title: "Entrega automática", text: "Assim que o pagamento é aprovado, a key é gerada e liberada na sua área do cliente." },
  { icon: QrCode, title: "PIX com aprovação rápida", text: "Pague com QR Code ou copia e cola, com confirmação automática." },
  { icon: Lock, title: "Pagamento seguro", text: "Dados de cartão processados pelo Mercado Pago. Não armazenamos seu cartão." },
  { icon: KeyRound, title: "Keys protegidas", text: "Suas keys ficam criptografadas e só você pode visualizá-las." },
  { icon: BadgeCheck, title: "Região informada", text: "Veja a região de ativação antes de comprar, sem surpresas." },
  { icon: Headphones, title: "Atendimento humano", text: "Problemas com seu pedido? Nossa equipe resolve com você." },
];

export function Advantages() {
  return (
    <section className="container-page py-10">
      <div className="card relative overflow-hidden p-6 sm:p-10">
        <div className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-accent/10 blur-3xl" />
        <h2 className="section-title mb-8 text-center">Por que comprar aqui?</h2>
        <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface-2">
                <Icon className="size-5 text-accent-2" />
              </span>
              <div>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
