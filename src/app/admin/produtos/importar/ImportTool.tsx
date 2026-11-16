"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ChevronDown, CircleHelp, Gamepad2, ListPlus, Loader2, Plus, Search, XCircle } from "lucide-react";
import { formatBRL } from "@/lib/money";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { importLinesAction, searchSupplierAction } from "../../actions";
import type { ImportLineResult } from "@/services/CatalogSyncService";

type Found = { appId: string; name: string; coverUrl: string | null; priceCents: number | null; imported: boolean };
type Added = { slug: string; name: string };

const BATCH = 8;

/** Capa da busca: algumas capas antigas da ShadowKeys não existem mais na Steam — mostra um placeholder. */
function Cover({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(!src);
  if (failed) {
    return (
      <div className="flex aspect-[460/215] w-full flex-col items-center justify-center gap-1 rounded-lg bg-gradient-to-br from-surface-3 to-surface p-2 text-center">
        <Gamepad2 className="size-5 text-subtle" />
        <span className="line-clamp-2 text-[11px] text-muted">{name}</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src!} alt="" loading="lazy" onError={() => setFailed(true)} className="aspect-[460/215] w-full rounded-lg object-cover" />;
}

export function ImportTool({ defaultPriceLabel }: { defaultPriceLabel: string }) {
  const router = useRouter();

  // ───── Busca instantânea ─────
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Record<string, Added>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [priceOpen, setPriceOpen] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setFound([]);
      setSearched("");
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchSupplierAction(term);
      if (id !== seq.current) return; // resposta de uma busca antiga
      setSearching(false);
      if (!r.ok) toast(r.message, "error");
      setFound(r.games as Found[]);
      setSearched(term);
      setSelected(new Set());
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const addGames = async (games: Found[]) => {
    if (!games.length) return;
    setAdding((s) => new Set([...s, ...games.map((g) => g.appId)]));
    for (let i = 0; i < games.length; i += BATCH) {
      const chunk = games.slice(i, i + BATCH);
      const r = await importLinesAction(chunk.map((g) => (prices[g.appId]?.trim() ? `${g.appId}; ${prices[g.appId]}` : g.appId)));
      if (!r.ok) {
        toast(r.message, "error");
        break;
      }
      r.results.forEach((res, idx) => {
        const g = chunk[idx]!;
        if (res.status === "imported" || res.status === "updated") {
          setAdded((a) => ({ ...a, [g.appId]: { slug: res.slug, name: res.name } }));
        } else {
          toast(`${g.name}: ${"message" in res ? res.message : "não foi possível adicionar"}`, "error");
        }
      });
    }
    setAdding((s) => {
      const n = new Set(s);
      games.forEach((g) => n.delete(g.appId));
      return n;
    });
    setSelected(new Set());
    toast(games.length === 1 ? `${games[0]!.name} adicionado à loja` : `${games.length} jogos processados`);
    router.refresh();
  };

  const isIn = (g: Found) => g.imported || Boolean(added[g.appId]);
  const toggle = (appId: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(appId)) n.delete(appId);
      else n.add(appId);
      return n;
    });
  const selectable = found.filter((g) => !isIn(g) && g.priceCents !== null);

  // ───── Lista colada (alternativa) ─────
  const [listOpen, setListOpen] = useState(false);
  const [text, setText] = useState("");
  const [results, setResults] = useState<ImportLineResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const runList = async (lines: string[]) => {
    setProgress({ done: 0, total: lines.length });
    const all: ImportLineResult[] = [];
    for (let i = 0; i < lines.length; i += BATCH) {
      const r = await importLinesAction(lines.slice(i, i + BATCH));
      if (!r.ok) {
        toast(r.message, "error");
        break;
      }
      all.push(...r.results);
      setResults((prev) => [...prev, ...r.results]);
      setProgress({ done: Math.min(lines.length, i + BATCH), total: lines.length });
    }
    setProgress(null);
    const ok = all.filter((r) => r.status === "imported" || r.status === "updated").length;
    toast(`${ok} de ${lines.length} jogo(s) adicionados`, ok ? "success" : "info");
    router.refresh();
  };

  const startList = () => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return toast("Cole ao menos um jogo", "info");
    if (lines.length > 500) return toast("Máximo de 500 linhas por vez", "error");
    setResults([]);
    void runList(lines);
  };

  const resolveAmbiguous = (line: string, appId: string) => {
    const price = line.split(/\s*[;\t]\s*/)[1];
    setResults((rs) => rs.filter((r) => r.line !== line));
    void runList([price ? `${appId}; ${price}` : appId]);
  };

  return (
    <div className="space-y-6">
      {/* Busca */}
      <section className="card space-y-5 p-5 sm:p-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Digite o nome do jogo (ex.: Elden Ring, GTA, Resident Evil...)"
            className="input h-14 rounded-2xl pl-12 pr-12 text-base"
          />
          {searching && <Loader2 className="absolute right-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-accent" />}
        </div>
        <p className="text-xs text-muted">
          Clique em <strong className="text-fg">Adicionar</strong> e o jogo entra na loja na hora, com capa, descrição e categoria. Preço padrão: <strong className="text-fg">{defaultPriceLabel}</strong> (pode mudar depois em Editar).
        </p>

        {searched && !searching && found.length === 0 && (
          <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">Nenhum jogo encontrado na ShadowKeys para “{searched}”. Tente outro nome ou o nome em inglês.</p>
        )}

        {found.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted">{found.length} resultado(s)</span>
              {selectable.length > 1 && (
                <button
                  onClick={() => setSelected(selected.size === selectable.length ? new Set() : new Set(selectable.map((g) => g.appId)))}
                  className="text-accent hover:underline"
                >
                  {selected.size === selectable.length ? "Desmarcar todos" : "Selecionar todos"}
                </button>
              )}
            </div>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {found.map((g) => {
                const inStore = isIn(g);
                const busy = adding.has(g.appId);
                const isSel = selected.has(g.appId);
                const noPrice = g.priceCents === null;
                return (
                  <li
                    key={g.appId}
                    className={cn(
                      "relative flex flex-col gap-2 rounded-xl border bg-surface-2 p-2.5 transition",
                      isSel ? "border-accent ring-2 ring-accent/30" : "border-line",
                      inStore && "opacity-80",
                    )}
                  >
                    {!inStore && !noPrice && (
                      <button
                        onClick={() => toggle(g.appId)}
                        aria-label={isSel ? "Desmarcar" : "Selecionar"}
                        className={cn(
                          "absolute left-4 top-4 z-10 grid size-6 place-items-center rounded-md border-2 transition",
                          isSel ? "border-accent bg-accent text-white" : "border-white/70 bg-black/50 text-transparent hover:border-white",
                        )}
                      >
                        <Check className="size-4" />
                      </button>
                    )}
                    <Cover src={g.coverUrl} name={g.name} />
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-white">{g.name}</p>
                    {inStore ? (
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-xs font-semibold text-success">
                          <CheckCircle2 className="size-4" /> Na loja
                        </span>
                        {added[g.appId] && (
                          <Link href={`/jogos/${added[g.appId]!.slug}`} target="_blank" className="text-xs text-accent hover:underline">
                            Ver
                          </Link>
                        )}
                      </div>
                    ) : noPrice ? (
                      <p className="mt-auto text-xs text-warning">Sem preço no seu plano ShadowKeys</p>
                    ) : (
                      <div className="mt-auto space-y-2">
                        {priceOpen === g.appId ? (
                          <input
                            autoFocus
                            value={prices[g.appId] ?? ""}
                            onChange={(e) => setPrices((p) => ({ ...p, [g.appId]: e.target.value }))}
                            placeholder="Preço, ex.: 34,90"
                            inputMode="decimal"
                            className="input h-9 py-1 text-xs"
                          />
                        ) : (
                          <button onClick={() => setPriceOpen(g.appId)} className="text-xs text-muted hover:text-fg">
                            {prices[g.appId] ? `Preço: R$ ${prices[g.appId]}` : `Preço padrão · alterar`}
                          </button>
                        )}
                        <button onClick={() => addGames([g])} disabled={busy} className="btn-primary h-9 w-full py-1 text-xs">
                          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Adicionar
                        </button>
                      </div>
                    )}
                    <span className="text-[10px] text-subtle">AppID {g.appId} · custo {formatBRL(g.priceCents)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* Barra de ação para seleção múltipla */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-30 flex items-center justify-between gap-3 rounded-2xl border border-accent/50 bg-surface-2/95 p-3 pl-5 shadow-2xl backdrop-blur">
          <span className="text-sm text-fg">
            <strong>{selected.size}</strong> jogo(s) selecionado(s)
          </span>
          <button onClick={() => addGames(found.filter((g) => selected.has(g.appId)))} className="btn-primary">
            <Plus className="size-4" /> Adicionar selecionados
          </button>
        </div>
      )}

      {/* Lista colada */}
      <section className="card">
        <button onClick={() => setListOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 p-5 text-left">
          <span className="flex items-center gap-3">
            <ListPlus className="size-5 text-accent" />
            <span>
              <span className="block font-semibold text-white">Adicionar vários de uma vez (colar lista)</span>
              <span className="block text-xs text-muted">Cole nomes ou AppIDs, um por linha, com preço opcional depois de “;”</span>
            </span>
          </span>
          <ChevronDown className={cn("size-5 text-muted transition", listOpen && "rotate-180")} />
        </button>
        {listOpen && (
          <div className="space-y-4 border-t border-line p-5">
            <pre className="rounded-lg bg-surface-2 p-3 text-xs text-fg">{`Elden Ring; 34,90\nCrimson Desert\nGrand Theft Auto V Legacy\n1259420; 24,90`}</pre>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="input font-mono text-sm" placeholder="Um jogo por linha..." />
            <button onClick={startList} disabled={!!progress} className="btn-primary">
              {progress ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {progress ? `Adicionando ${progress.done}/${progress.total}...` : "Adicionar lista"}
            </button>

            {results.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {results.map((r, i) => (
                  <li key={`${r.line}-${i}`} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                    {r.status === "imported" || r.status === "updated" ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    ) : r.status === "ambiguous" ? (
                      <CircleHelp className="mt-0.5 size-4 shrink-0 text-warning" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-muted">{r.line}</p>
                      {(r.status === "imported" || r.status === "updated") && (
                        <p className="text-fg">
                          <Link href={`/jogos/${r.slug}`} target="_blank" className="font-semibold hover:text-accent">{r.name}</Link>
                          {r.priceCents ? ` · ${formatBRL(r.priceCents)}` : " · preço padrão"}
                          {r.status === "updated" && <span className="text-muted"> (já estava na loja)</span>}
                        </p>
                      )}
                      {(r.status === "not_found" || r.status === "error") && <p className="text-danger">{r.message}</p>}
                      {r.status === "ambiguous" && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="text-warning">Qual destes?</span>
                          {r.candidates.map((c) => (
                            <button key={c.appId} onClick={() => resolveAmbiguous(r.line, c.appId)} className="badge cursor-pointer bg-surface-3 px-2.5 py-1 text-fg hover:bg-accent hover:text-white">
                              {c.name} ({c.appId})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
