"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { formatDateTime } from "@/lib/utils";

interface RevealedKey {
  id: string;
  orderItemId: string;
  productName: string;
  code: string;
  deliveredAt: string;
  isTest: boolean;
}

/**
 * Keys buscadas no endpoint autenticado (sem cache).
 * autoLoad: busca e exibe assim que o componente aparece (ex.: logo após a compra ser aprovada).
 */
export function KeyReveal({ orderId, keyCount, autoLoad = false }: { orderId: string; keyCount: number; autoLoad?: boolean }) {
  const [keys, setKeys] = useState<RevealedKey[] | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    if (keys) return setVisible((v) => !v);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/keys`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Não foi possível carregar as keys");
      setKeys(d.keys);
      setVisible(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const autoLoaded = useRef(false);
  useEffect(() => {
    if (!autoLoad || autoLoaded.current) return;
    autoLoaded.current = true;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad]);

  const copy = async (k: RevealedKey) => {
    try {
      await navigator.clipboard.writeText(k.code);
      setCopied(k.id);
      toast("Key copiada!");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast("Não foi possível copiar", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted">
          <KeyRound className="size-4 text-accent" /> {keyCount} key(s) disponível(is)
        </p>
        <button onClick={load} disabled={loading} className="btn-primary">
          {loading ? <Loader2 className="size-4 animate-spin" /> : visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {visible ? "Ocultar keys" : "Mostrar keys"}
        </button>
      </div>
      {error && (
        <p className="text-sm text-danger">
          {error}{" "}
          {!keys && (
            <button onClick={load} className="underline">Tentar novamente</button>
          )}
        </p>
      )}
      {loading && !keys && (
        <div className="space-y-2.5">
          {Array.from({ length: Math.min(keyCount, 3) || 1 }).map((_, i) => <div key={i} className="skeleton h-24" />)}
        </div>
      )}
      {visible && keys && (
        <ul className="space-y-2.5">
          {keys.map((k) => (
            <li key={k.id} className="rounded-xl border border-line-strong bg-surface-2 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{k.productName}</span>
                <span className="text-xs text-muted">Entregue em {formatDateTime(k.deliveredAt)}</span>
              </div>
              {k.isTest && <p className="mb-2 text-xs font-bold uppercase text-warning">Key de teste (ambiente sandbox) — não é válida</p>}
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all overflow-x-auto rounded-lg border border-accent/30 bg-bg px-3 py-2.5 font-mono text-base tracking-wider text-accent-2">{k.code}</code>
                <button onClick={() => copy(k)} className="btn-secondary px-3" aria-label="Copiar key">
                  {copied === k.id ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-subtle">Não compartilhe suas keys. Cada visualização é registrada por segurança.</p>
    </div>
  );
}
