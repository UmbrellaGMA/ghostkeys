import Link from "next/link";
import { LogoMark } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <LogoMark className="mx-auto size-16" />
        <p className="mt-6 font-display text-6xl font-bold text-white">404</p>
        <h1 className="mt-2 text-lg text-muted">Página não encontrada</h1>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="btn-primary">Ir para o início</Link>
          <Link href="/jogos" className="btn-secondary">Ver jogos</Link>
        </div>
      </div>
    </div>
  );
}
