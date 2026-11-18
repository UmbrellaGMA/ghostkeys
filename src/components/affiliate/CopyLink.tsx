"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

/** Campo com o link + botões copiar / compartilhar (WhatsApp etc. no celular). */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare("share" in navigator), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.getElementById("affiliate-link") as HTMLInputElement | null;
      el?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input id="affiliate-link" readOnly value={url} onFocus={(e) => e.target.select()} className="input min-w-0 flex-1 font-mono text-xs" aria-label="Link do afiliado" />
      <button type="button" onClick={copy} className="btn-secondary">
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />} {copied ? "Copiado" : "Copiar"}
      </button>
      {canShare && (
        <button type="button" onClick={() => navigator.share({ title: "Suas vendas na GhostKeys", url }).catch(() => {})} className="btn-secondary sm:hidden">
          <Share2 className="size-4" /> Enviar
        </button>
      )}
    </div>
  );
}
