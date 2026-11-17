"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headphones, Menu, Package, User, X } from "lucide-react";
import { SearchBox } from "./SearchBox";

/**
 * Menu lateral do celular.
 * Renderizado via portal no <body>: o cabeçalho usa backdrop-filter, que transforma o header
 * no "containing block" de elementos position:fixed — sem o portal o menu ficaria preso
 * à altura do cabeçalho (72px) e apareceria cortado.
 */
export function MobileMenu({ links, categories, isLoggedIn }: { links: Array<{ href: string; label: string }>; categories: Array<{ slug: string; name: string }>; isLoggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const drawer = (
    <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Fechar menu" tabIndex={-1} />
      <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm animate-fade-up flex-col gap-5 overflow-y-auto overscroll-contain border-l border-line bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-bold">Menu</span>
          <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="grid size-11 place-items-center rounded-lg hover:bg-surface-2">
            <X className="size-5" />
          </button>
        </div>
        <SearchBox />
        <nav className="flex flex-col">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-3 font-semibold text-fg hover:bg-surface-2">
              {l.label}
            </Link>
          ))}
        </nav>
        <div>
          <p className="label px-3">Categorias</p>
          <div className="grid grid-cols-2 gap-1">
            {categories.map((c) => (
              <Link key={c.slug} href={`/jogos?categoria=${c.slug}`} className="rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-auto space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Link href="/conta/pedidos" className="btn-secondary text-xs">
              <Package className="size-4" /> Meus pedidos
            </Link>
            <Link href="/paginas/atendimento" className="btn-secondary text-xs">
              <Headphones className="size-4" /> Atendimento
            </Link>
          </div>
          <Link href={isLoggedIn ? "/conta" : "/entrar"} className="btn-primary w-full">
            <User className="size-4" /> {isLoggedIn ? "Minha conta" : "Entrar ou cadastrar"}
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-xl border border-line-strong bg-surface-2 lg:hidden" aria-label="Abrir menu" aria-expanded={open}>
        <Menu className="size-5" />
      </button>
      {open && mounted && createPortal(drawer, document.body)}
    </>
  );
}
