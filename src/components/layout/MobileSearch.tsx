"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { SearchBox } from "./SearchBox";

/**
 * Busca no topo do celular: abre uma tela de busca com o teclado já aberto.
 * O iOS só abre o teclado se o foco acontecer dentro do toque do usuário; por isso o toque
 * foca um campo "ponte" invisível na hora e a busca real herda o foco ao montar.
 * Renderizada via portal (o cabeçalho com backdrop-filter prende elementos position:fixed).
 */
export function MobileSearch() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const bridge = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname, params]);
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

  return (
    <>
      <button
        type="button"
        onClick={() => {
          bridge.current?.focus();
          setOpen(true);
        }}
        className="grid size-11 place-items-center rounded-xl border border-line-strong bg-surface-2 md:hidden"
        aria-label="Buscar"
      >
        <Search className="size-5" />
      </button>
      <input ref={bridge} aria-hidden tabIndex={-1} className="pointer-events-none fixed left-0 top-0 size-px opacity-0 md:hidden" style={{ fontSize: 16 }} />

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Buscar jogos">
            <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Fechar busca" tabIndex={-1} />
            <div className="relative animate-fade-up border-b border-line bg-surface px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="flex items-center gap-2">
                <SearchBox autoFocus className="flex-1" onDone={() => setOpen(false)} />
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-2 text-sm">
                  Cancelar
                </button>
              </div>
              <p className="mt-3 text-xs text-muted">Digite o nome do jogo. Toque em um resultado para abrir.</p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
