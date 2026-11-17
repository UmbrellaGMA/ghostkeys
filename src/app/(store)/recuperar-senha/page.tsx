"use client";
import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, FormError, FormSuccess } from "@/components/auth/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Informe um e-mail válido.");
    setLoading(true);
    setError(null);
    await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
    });
    // Mesma resposta exista ou não a conta (evita enumeração de e-mails)
    setLoading(false);
    setSent(true);
  };

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <FormSuccess message="Se houver uma conta com este e-mail, você receberá o link em instantes." />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={error} />
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading && <Loader2 className="size-4 animate-spin" />} Enviar link
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/entrar" className="text-accent hover:underline">Voltar para o login</Link>
      </p>
    </AuthShell>
  );
}
