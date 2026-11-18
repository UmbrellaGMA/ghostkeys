"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import { ChatMessages, type ChatMessage } from "./ChatMessages";

/** Abre o chat de qualquer lugar da loja: openSupportChat("Pedido #123: ") */
export function openSupportChat(text?: string) {
  window.dispatchEvent(new CustomEvent("gk:support-open", { detail: { text } }));
}

interface Me {
  loggedIn: boolean;
  name: string | null;
  email: string | null;
}

const MARKER = "gk_support_active"; // há conversa neste aparelho: verifica respostas mesmo com o chat fechado
const store = {
  get: () => {
    try {
      return localStorage.getItem(MARKER) === "1";
    } catch {
      return false;
    }
  },
  set: () => {
    try {
      localStorage.setItem(MARKER, "1");
    } catch {}
  },
};

/** Rotas com barra fixa no rodapé do celular: o botão sobe para não cobrir. */
const LIFTED = [/^\/jogos\/[^/]+$/, /^\/carrinho/, /^\/checkout/];

/**
 * Chat de suporte da loja: botão flutuante + janela de conversa (tela cheia no celular).
 * Mensagens novas chegam a cada poucos segundos enquanto o chat está aberto.
 */
export function SupportWidget({ hours }: { hours: string | null }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasConversation, setHasConversation] = useState(false);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAt = useRef<string | null>(null);
  const loaded = useRef(false);

  const lifted = LIFTED.some((r) => r.test(pathname));
  const isSupportPage = pathname === "/suporte";

  const merge = useCallback((incoming: ChatMessage[], replace = false) => {
    if (!incoming.length && !replace) return;
    setMessages((prev) => {
      const base = replace ? [] : prev.filter((m) => !m.pending && !m.failed);
      const seen = new Set(base.map((m) => m.id));
      const next = [...base, ...incoming.filter((m) => !seen.has(m.id))];
      const keep = replace ? [] : prev.filter((m) => m.pending || m.failed);
      return [...next, ...keep];
    });
    const last = incoming[incoming.length - 1];
    if (last && (!lastAt.current || last.created_at > lastAt.current)) lastAt.current = last.created_at;
  }, []);

  const fetchChat = useCallback(
    async (opts: { seen: boolean; full?: boolean }) => {
      const qs = new URLSearchParams();
      if (!opts.full && lastAt.current) qs.set("after", lastAt.current);
      if (opts.seen) qs.set("seen", "1");
      const res = await fetch(`/api/support?${qs}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { me: Me; conversation: { unread: number } | null; messages: ChatMessage[] };
      setMe(data.me);
      if (data.conversation) {
        setHasConversation(true);
        store.set();
        setUnread(data.conversation.unread);
      }
      merge(data.messages, Boolean(opts.full));
    },
    [merge],
  );

  // Abrir: botão, evento global, /suporte ou ?suporte=1
  useEffect(() => {
    setMounted(true);
    const onOpen = (e: Event) => {
      const t = (e as CustomEvent<{ text?: string }>).detail?.text;
      if (t) setText((cur) => cur || t);
      setOpen(true);
    };
    window.addEventListener("gk:support-open", onOpen);
    return () => window.removeEventListener("gk:support-open", onOpen);
  }, []);
  useEffect(() => {
    if (isSupportPage || params.get("suporte") === "1") setOpen(true);
  }, [isSupportPage, params]);

  // Chat aberto: carrega tudo uma vez e busca novidades a cada 4 s (só com a aba visível)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      if (!loaded.current) {
        setLoading(true);
        await fetchChat({ seen: true, full: true }).catch(() => {});
        loaded.current = true;
        if (alive) setLoading(false);
      } else await fetchChat({ seen: true }).catch(() => {});
    })();
    const t = setInterval(() => document.visibilityState === "visible" && fetchChat({ seen: true }).catch(() => {}), 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open, fetchChat]);

  // Chat fechado, mas com conversa neste aparelho: verifica respostas a cada 45 s
  useEffect(() => {
    if (open || !mounted || !store.get()) return;
    const check = () => document.visibilityState === "visible" && fetchChat({ seen: false }).catch(() => {});
    check();
    const t = setInterval(check, 45_000);
    return () => clearInterval(t);
  }, [open, mounted, fetchChat]);

  // Trava o fundo no celular e fecha com Esc
  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 639px)").matches;
    if (mobile) document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    if (!mobile) setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Rola para a última mensagem
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, loading]);

  // Campo cresce com o texto (até 5 linhas)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text, open]);

  const needsContact = me !== null && !me.loggedIn && !hasConversation;

  async function send(body: string, retryId?: string) {
    const clean = body.trim();
    if (!clean || sending) return;
    setError(null);
    if (needsContact) {
      if (!name.trim()) return setError("Informe seu nome.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Informe um e-mail válido para receber a resposta.");
    }
    const tempId = retryId ?? `tmp-${Date.now()}`;
    const temp: ChatMessage = { id: tempId, sender: "customer", body: clean, created_at: new Date().toISOString(), pending: true };
    setMessages((prev) => [...prev.filter((m) => m.id !== tempId), temp]);
    if (!retryId) setText("");
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: clean, ...(needsContact ? { name: name.trim(), email: email.trim() } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não foi possível enviar. Tente de novo.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      merge([data.message as ChatMessage]);
      setHasConversation(true);
      store.set();
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const button = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-label={open ? "Fechar chat de suporte" : "Abrir chat de suporte"}
      aria-expanded={open}
      className={cn(
        "fixed right-4 z-40 grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition hover:scale-105 active:scale-95 sm:right-6 sm:bottom-6",
        lifted ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6" : "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
        open && "max-sm:hidden",
      )}
    >
      {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      {!open && unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full border-2 border-bg bg-red-500 px-1 text-[11px] font-bold">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );

  const panel = (
    <div
      role="dialog"
      aria-label="Chat de suporte"
      className={cn(
        "fixed z-[70] flex flex-col overflow-hidden bg-surface animate-fade-up",
        "inset-0 pt-[env(safe-area-inset-top)]",
        "sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-2xl sm:border sm:border-line sm:pt-0 sm:shadow-2xl sm:shadow-black/50",
      )}
    >
      <header className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
        <span className="grid size-10 place-items-center rounded-full bg-accent/15">
          <LogoMark className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-white">Suporte GhostKeys</p>
          <p className="truncate text-xs text-muted">{hours || "Respondemos o mais rápido possível"}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost min-h-10 px-2" aria-label="Fechar chat">
          <X className="size-5" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        {loading ? (
          <div className="grid h-full place-items-center text-muted">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="mb-3 max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-2 px-3.5 py-2 text-[15px] leading-snug text-fg">
              Olá{me?.name ? `, ${me.name.split(/\s+/)[0]}` : ""}! 👋 Como podemos ajudar? Envie sua dúvida sobre pedidos, keys ou ativação.
              {!hasConversation && <span className="mt-1 block text-xs text-muted">Você recebe a resposta aqui e também por e-mail.</span>}
            </div>
            <ChatMessages messages={messages} me="customer" onRetry={(m) => send(m.body, m.id)} />
          </>
        )}
      </div>

      <form
        className="border-t border-line bg-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        {needsContact && (
          <div className="mb-2 grid grid-cols-2 gap-2">
            <input className="input min-h-10 py-2" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" aria-label="Seu nome" />
            <input
              className="input min-h-10 py-2"
              placeholder="Seu e-mail"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              autoComplete="email"
              aria-label="Seu e-mail"
            />
            <p className="col-span-2 text-[11px] text-subtle">
              Já tem conta?{" "}
              <Link href={`/entrar?next=${encodeURIComponent(pathname)}`} className="text-accent-2 underline" onClick={() => setOpen(false)}>
                Entre
              </Link>{" "}
              para ver seus pedidos na conversa.
            </p>
          </div>
        )}
        {error && <p className="mb-2 text-xs text-red-300" role="alert">{error}</p>}
        <div className="flex items-end gap-2">
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
            placeholder="Escreva sua mensagem…"
            enterKeyHint="send"
            aria-label="Mensagem"
            className="input max-h-[132px] min-h-11 flex-1 resize-none py-2.5"
          />
          <button type="submit" disabled={!text.trim() || sending} className="btn-primary size-11 shrink-0 p-0" aria-label="Enviar">
            {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </button>
        </div>
      </form>
    </div>
  );

  if (!mounted) return null;
  return (
    <>
      {button}
      {open && createPortal(panel, document.body)}
    </>
  );
}
