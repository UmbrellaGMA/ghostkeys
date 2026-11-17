"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { formatBRL } from "@/lib/money";
import { GameImage } from "@/components/product/GameImage";
import { cn } from "@/lib/utils";

interface Result {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  price_cents: number;
  available: boolean;
}

/** Pesquisa com resultados instantâneos (debounce + cancelamento de requisições antigas). */
export function SearchBox({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const uid = useId();
  const inputId = `site-search-${uid}`;
  const listId = `search-results-${uid}`;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(-1);
  const debounced = useDebounce(q.trim(), 220);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d) => {
        setResults(d.results ?? []);
        setActive(-1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [debounced]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (active >= 0 && results[active]) {
      router.push(`/jogos/${results[active].slug}`);
    } else if (q.trim()) {
      router.push(`/jogos?q=${encodeURIComponent(q.trim())}`);
    }
    setOpen(false);
    onDone?.();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showPanel = open && debounced.length >= 2;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <form onSubmit={submit} role="search">
        <label htmlFor={inputId} className="sr-only">
          Buscar jogos
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          id={inputId}
          name="q"
          enterKeyHint="search"
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder="Buscar jogos..."
          className="input h-11 rounded-xl pl-10 pr-10"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
        />
        {loading && <Loader2 className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />}
      </form>

      {showPanel && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-2xl">
          {results.length === 0 && !loading && <p className="px-4 py-5 text-center text-sm text-muted">Nenhum jogo encontrado para “{debounced}”.</p>}
          {results.map((r, i) => (
            <Link
              key={r.id}
              href={`/jogos/${r.slug}`}
              role="option"
              aria-selected={i === active}
              onClick={() => {
                setOpen(false);
                onDone?.();
              }}
              className={cn("flex items-center gap-3 px-3 py-3 transition hover:bg-surface-3", i === active && "bg-surface-3")}
            >
              <div className="relative h-9 w-[72px] shrink-0 overflow-hidden rounded-md sm:h-10 sm:w-[86px]">
                <GameImage src={r.image_url} alt="" sizes="86px" />
              </div>
              <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug text-fg">{r.name}</span>
              <span className={cn("shrink-0 whitespace-nowrap text-sm font-bold", r.available ? "text-white" : "text-subtle")}>{r.available ? formatBRL(r.price_cents) : "Indisponível"}</span>
            </Link>
          ))}
          {results.length > 0 && (
            <button onClick={submit} className="block w-full border-t border-line px-4 py-2.5 text-left text-sm font-semibold text-accent hover:bg-surface-3">
              Ver todos os resultados para “{debounced}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
