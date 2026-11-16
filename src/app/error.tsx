"use client";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <div className="card max-w-md p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" />
        <h1 className="mt-4 font-display text-xl font-bold text-white">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted">Não foi possível carregar esta página. Tente novamente em instantes.</p>
        <button onClick={reset} className="btn-primary mt-6">Tentar novamente</button>
      </div>
    </div>
  );
}
