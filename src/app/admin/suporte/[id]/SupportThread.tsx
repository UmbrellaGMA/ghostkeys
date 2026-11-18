"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Package, RotateCcw, Send } from "lucide-react";
import { ChatMessages, type ChatMessage } from "@/components/support/ChatMessages";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";
import { formatBRL } from "@/lib/money";
import { formatDateTime, cn } from "@/lib/utils";
import type { OrderStatus } from "@/types";

export interface CustomerOrder {
  id: string;
  order_number: number;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
}

interface Props {
  conversation: { id: string; name: string; email: string; isGuest: boolean; status: "open" | "closed"; createdAt: string };
  initialMessages: ChatMessage[];
  orders: CustomerOrder[];
}

const QUICK = [
  "Olá! Tudo bem? Como posso ajudar?",
  "Vou verificar e já te respondo. 🙂",
  "Pode me informar o número do pedido?",
  "Resolvido! Qualquer coisa é só chamar aqui. 👻",
];

/** Conversa no painel: mensagens novas a cada 3 s, resposta, respostas rápidas e abrir/fechar. */
export function SupportThread({ conversation, initialMessages, orders }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [status, setStatus] = useState(conversation.status);
  const [online, setOnline] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const lastAt = useRef<string | null>(initialMessages.at(-1)?.created_at ?? null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const url = `/api/admin/support/${conversation.id}`;

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const confirmed = prev.filter((m) => !m.pending && !m.failed);
      const pending = prev.filter((m) => m.pending || m.failed);
      return [...confirmed, ...incoming.filter((m) => !seen.has(m.id)), ...pending];
    });
    const last = incoming[incoming.length - 1]!;
    if (!lastAt.current || last.created_at > lastAt.current) lastAt.current = last.created_at;
  }, []);

  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const qs = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
      const res = await fetch(url + qs, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { conversation: { status: "open" | "closed"; customerOnline: boolean }; messages: ChatMessage[] };
      setStatus(data.conversation.status);
      setOnline(data.conversation.customerOnline);
      merge(data.messages);
    };
    void poll();
    const t = setInterval(poll, 3000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [url, merge]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  async function send(body: string, retryId?: string) {
    const clean = body.trim();
    if (!clean || sending) return;
    setError(null);
    const tempId = retryId ?? `tmp-${Date.now()}`;
    setMessages((prev) => [...prev.filter((m) => m.id !== tempId), { id: tempId, sender: "admin", body: clean, created_at: new Date().toISOString(), pending: true }]);
    if (!retryId) setText("");
    setSending(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: clean }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível enviar.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      merge([data.message as ChatMessage]);
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      setError((e as Error).message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function toggleStatus() {
    const next = status === "open" ? "closed" : "open";
    setToggling(true);
    const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) }).catch(() => null);
    if (res?.ok) setStatus(next);
    else setError("Não foi possível alterar o status.");
    setToggling(false);
  }

  return (
    <div
      className={cn(
        "flex flex-col",
        // Altura da tela menos cabeçalho, barra de abas e espaçamentos do painel
        "h-[calc(100dvh-9.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]",
        "sm:h-[calc(100dvh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]",
        "lg:h-[calc(100dvh-4rem)]",
      )}
    >
      {/* Cabeçalho da conversa */}
      <div className="mb-3 flex items-start gap-3">
        <Link href="/admin/suporte" className="btn-ghost min-h-10 shrink-0 px-2" aria-label="Voltar às conversas">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-display text-lg font-bold text-white">
            {conversation.name}
            {online && <span className="size-2 shrink-0 rounded-full bg-success" title="Com o chat aberto agora" />}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted">
            <Mail className="size-3 shrink-0" />
            <a href={`mailto:${conversation.email}`} className="truncate hover:text-fg">
              {conversation.email}
            </a>
            {conversation.isGuest && <span className="shrink-0 rounded bg-surface-2 px-1.5 text-[10px] uppercase text-subtle">visitante</span>}
          </p>
        </div>
        <button type="button" onClick={toggleStatus} disabled={toggling} className={cn("btn-secondary min-h-10 shrink-0 px-3 text-xs", status === "closed" && "border-success/40")}>
          {toggling ? <Loader2 className="size-4 animate-spin" /> : status === "open" ? <CheckCircle2 className="size-4" /> : <RotateCcw className="size-4" />}
          <span className="max-sm:hidden">{status === "open" ? "Marcar como resolvida" : "Reabrir"}</span>
          <span className="sm:hidden">{status === "open" ? "Resolver" : "Reabrir"}</span>
        </button>
      </div>

      {/* Pedidos do cliente */}
      <details className="card mb-3 shrink-0 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-muted">
          <Package className="size-4" /> Pedidos do cliente ({orders.length})
        </summary>
        {orders.length ? (
          <ul className="max-h-48 divide-y divide-line overflow-y-auto border-t border-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/pedidos/${o.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2">
                  <span className="font-semibold text-white">#{o.order_number}</span>
                  <span className="text-xs text-subtle">{formatDateTime(o.created_at)}</span>
                  <span className="ml-auto">{formatBRL(o.total_cents)}</span>
                  <OrderStatusBadge status={o.status} className="text-[10px]" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-line px-4 py-3 text-xs text-subtle">Nenhum pedido com este e-mail.</p>
        )}
      </details>

      {/* Mensagens */}
      <div ref={listRef} className="card min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        <p className="mb-3 text-center text-[11px] text-subtle">Conversa iniciada em {formatDateTime(conversation.createdAt)}</p>
        <ChatMessages messages={messages} me="admin" onRetry={(m) => send(m.body, m.id)} />
        {status === "closed" && <p className="mt-4 text-center text-xs text-success">Conversa marcada como resolvida. Ela reabre se o cliente escrever de novo.</p>}
      </div>

      {/* Respostas rápidas + campo */}
      <div className="mt-3 shrink-0">
        <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setText((t) => (t ? `${t} ${q}` : q));
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-fg"
            >
              {q}
            </button>
          ))}
        </div>
        {error && <p className="mb-2 text-xs text-red-300" role="alert">{error}</p>}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                void send(text);
              }
            }}
            maxLength={2000}
            placeholder={`Responder ${conversation.name.split(/\s+/)[0]}…`}
            enterKeyHint="send"
            aria-label="Resposta"
            className="input max-h-40 min-h-11 flex-1 resize-none py-2.5"
          />
          <button type="submit" disabled={!text.trim() || sending} className="btn-primary size-11 shrink-0 p-0" aria-label="Enviar resposta">
            {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </button>
        </form>
        <p className="mt-1.5 text-[11px] text-subtle">Se o cliente não estiver com o chat aberto, ele recebe sua resposta por e-mail.</p>
      </div>
    </div>
  );
}
