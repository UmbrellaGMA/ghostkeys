"use client";
import { Fragment } from "react";
import { AlertCircle, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  sender: "customer" | "admin";
  body: string;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
}

const TZ = "America/Sao_Paulo";
const time = (iso: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const dayKey = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ }).format(new Date(iso));

function dayLabel(iso: string) {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return "Hoje";
  if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: TZ }).format(new Date(iso));
}

/** Links clicáveis (só http/https) sem usar HTML cru. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Lista de mensagens no estilo de conversa. `me` define qual lado fica à direita
 * (cliente na loja, admin no painel).
 */
export function ChatMessages({ messages, me, onRetry }: { messages: ChatMessage[]; me: "customer" | "admin"; onRetry?: (m: ChatMessage) => void }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const mine = m.sender === me;
        const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
        const grouped = prev && !newDay && prev.sender === m.sender && Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60_000;
        return (
          <Fragment key={m.id}>
            {newDay && (
              <li className="my-2 self-center rounded-full bg-surface-2 px-3 py-1 text-[11px] font-medium text-muted" role="separator">
                {dayLabel(m.created_at)}
              </li>
            )}
            <li className={cn("flex max-w-[85%] flex-col", mine ? "items-end self-end" : "items-start self-start", !grouped && !newDay && "mt-2")}>
              <div
                className={cn(
                  "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
                  mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md border border-line bg-surface-2 text-fg",
                  m.failed && "bg-red-500/20 text-red-100",
                )}
              >
                <Linkified text={m.body} />
              </div>
              <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-subtle">
                {m.failed ? (
                  <button type="button" onClick={() => onRetry?.(m)} className="flex items-center gap-1 text-red-300 underline">
                    <AlertCircle className="size-3" /> Não enviada · tentar de novo
                  </button>
                ) : m.pending ? (
                  <>
                    <Clock className="size-3" /> enviando…
                  </>
                ) : (
                  <>
                    {time(m.created_at)}
                    {mine && <Check className="size-3" />}
                  </>
                )}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
