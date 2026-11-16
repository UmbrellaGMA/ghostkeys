"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SearchBox } from "./SearchBox";

export function MobileMenu({ links, categories, isLoggedIn }: { links: Array<{ href: string; label: string }>; categories: Array<{ slug: string; name: string }>; isLoggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-xl border border-line-strong bg-surface-2 lg:hidden" aria-label="Abrir menu">
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm animate-fade-up flex-col gap-5 overflow-y-auto border-l border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-bold">Menu</span>
              <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="grid size-10 place-items-center rounded-lg hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>
            <SearchBox />
            <nav className="flex flex-col">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2.5 font-semibold text-fg hover:bg-surface-2">
                  {l.label}
                </Link>
              ))}
            </nav>
            <div>
              <p className="label px-3">Categorias</p>
              <div className="grid grid-cols-2 gap-1">
                {categories.map((c) => (
                  <Link key={c.slug} href={`/jogos?categoria=${c.slug}`} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
            <Link href={isLoggedIn ? "/conta" : "/entrar"} className="btn-primary mt-auto">
              {isLoggedIn ? "Minha conta" : "Entrar ou cadastrar"}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
