"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signInSchema } from "@/validations/schemas";
import { FormError } from "@/components/auth/AuthShell";

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(linkError ? "Link inválido ou expirado. Solicite um novo." : null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword(parsed.data);
    if (error) {
      setLoading(false);
      setError(error.message.includes("Email not confirmed") ? "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada)." : "E-mail ou senha incorretos.");
      return;
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={error} />
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" required />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">Senha</label>
          <Link href="/recuperar-senha" className="-mb-0.5 -mt-2 py-2 text-xs text-accent hover:underline">Esqueci minha senha</Link>
        </div>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" required />
      </div>
      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading && <Loader2 className="size-4 animate-spin" />} Entrar
      </button>
      <p className="text-center text-sm text-muted">
        Não tem conta? <Link href={`/cadastro?next=${encodeURIComponent(next)}`} className="font-semibold text-accent hover:underline">Cadastre-se</Link>
      </p>
    </form>
  );
}
