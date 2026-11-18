"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgePercent, BarChart3, Bell, BookOpen, FileText, Gamepad2, Layers, Menu, MessageCircle, Package, PlusCircle, Settings, Store, Tag, Users, X } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { SignOutButton } from "@/components/account/SignOutButton";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", short: "Início", icon: BarChart3 },
  { href: "/admin/pedidos", label: "Pedidos", short: "Pedidos", icon: Package },
  { href: "/admin/suporte", label: "Suporte", short: "Suporte", icon: MessageCircle },
  { href: "/admin/produtos", label: "Produtos", short: "Produtos", icon: Gamepad2 },
  { href: "/admin/notificacoes", label: "Notificações", short: "Avisos", icon: Bell },
  { href: "/admin/produtos/importar", label: "Adicionar jogos", icon: PlusCircle },
  { href: "/admin/categorias", label: "Categorias", icon: Layers },
  { href: "/admin/cupons", label: "Cupons", icon: Tag },
  { href: "/admin/afiliados", label: "Afiliados", icon: BadgePercent },
  { href: "/admin/tutoriais", label: "Tutoriais de ativação", icon: BookOpen },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
  { href: "/admin/logs", label: "Logs", icon: FileText },
];
const TABS = NAV.slice(0, 4);

/**
 * Conversas de suporte aguardando resposta (selo no menu e no ícone do app).
 * Verifica a cada 20 s com o painel visível.
 */
function useSupportUnread() {
  const [unread, setUnread] = useState(0);
  const path = usePathname();
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/admin/support", { cache: "no-store" }).catch(() => null);
      if (!res?.ok || !alive) return;
      const { unread: n } = (await res.json()) as { unread: number };
      setUnread(n);
      const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
      (n ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {});
    };
    void check();
    const t = setInterval(check, 20_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [path]);
  return unread;
}

function Badge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-5 text-white", className)} aria-label={`${n} não lida(s)`}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

/** Rota ativa: a mais específica que casa com o caminho atual. */
function useActive() {
  const path = usePathname();
  const match = NAV.filter((n) => path === n.href || (n.href !== "/admin" && path.startsWith(`${n.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.href ?? (path === "/admin" ? "/admin" : null);
}

/** Barra lateral (computador). */
export function AdminSidebar({ email }: { email: string }) {
  const active = useActive();
  const unread = useSupportUnread();
  return (
    <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <LogoMark className="size-8" />
        <span className="font-display font-bold text-white">Painel</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
              active === href ? "bg-accent/15 font-semibold text-white" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className={cn("size-4", active === href && "text-accent-2")} /> {label}
            {href === "/admin/suporte" && <Badge n={unread} className="ml-auto" />}
          </Link>
        ))}
      </nav>
      <div className="border-t border-line px-3 py-4">
        <p className="truncate px-3 pb-2 text-xs text-subtle">{email}</p>
        <Link href="/" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
          <Store className="size-4" /> Ver loja
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}

/** Cabeçalho + barra de abas inferior + menu "Mais" (celular / app do iPhone). */
export function AdminMobileNav({ email }: { email: string }) {
  const active = useActive();
  const unread = useSupportUnread();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = NAV.find((n) => n.href === active);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const inTabs = TABS.some((t) => t.href === active);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-lg lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <LogoMark className="size-7" />
          <span className="flex-1 truncate font-display font-bold text-white">{current?.label ?? "Painel"}</span>
          <Link href="/" className="btn-ghost min-h-9 px-2.5 py-1.5 text-xs">
            <Store className="size-4" /> Loja
          </Link>
        </div>
      </header>

      <nav
        aria-label="Navegação do painel"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {TABS.map(({ href, short, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active === href ? "text-accent-2" : "text-muted")}
                aria-current={active === href ? "page" : undefined}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {href === "/admin/suporte" && <Badge n={unread} className="absolute -right-3 -top-2" />}
                </span>
                {short}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn("flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium", !inTabs && active ? "text-accent-2" : "text-muted")}
              aria-expanded={open}
            >
              <Menu className="size-5" /> Mais
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu do painel">
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Fechar menu" />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-up">
            <div className="sticky top-0 flex items-center justify-between bg-surface px-5 pb-2 pt-4">
              <p className="truncate text-xs text-subtle">{email}</p>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost min-h-9 px-2" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-2 px-4">
              {NAV.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "flex h-full min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-xs",
                      active === href ? "border-accent/50 bg-accent/15 text-white" : "border-line bg-surface-2 text-fg",
                    )}
                  >
                    <Icon className={cn("size-5", active === href ? "text-accent-2" : "text-muted")} />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2 px-4">
              <Link href="/" className="btn-secondary flex-1">
                <Store className="size-4" /> Ver loja
              </Link>
              <SignOutButton className="btn-secondary flex-1 justify-center" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
