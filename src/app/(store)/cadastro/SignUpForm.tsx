"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signUpSchema } from "@/validations/schemas";
import { FormError, FormSuccess } from "@/components/auth/AuthShell";

export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setLoading(true);
    setError(null);
    const { data, error } = await createClient().auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message.includes("already registered") ? "Este e-mail já está cadastrado." : "Não foi possível criar a conta. Tente novamente.");
      return;
    }
    if (data.session) {
      router.replace(next);
      router.refresh();
    } else {
      setSuccess("Conta criada! Enviamos um link de confirmação para o seu e-mail.");
    }
  };

  if (success) return <FormSuccess message={success} />;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormError message={error} />
      <div>
        <label className="label" htmlFor="fullName">Nome completo</label>
        <input id="fullName" autoComplete="name" autoCapitalize="words" value={form.fullName} onChange={set("fullName")} className="input" required />
      </div>
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" value={form.email} onChange={set("email")} className="input" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">Senha</label>
          <input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="confirmPassword">Confirmar</label>
          <input id="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set("confirmPassword")} className="input" required />
        </div>
      </div>
      <p className="text-xs text-muted">Mínimo de 8 caracteres, com letras e números.</p>
      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading && <Loader2 className="size-4 animate-spin" />} Criar conta
      </button>
      <p className="text-center text-sm text-muted">
        Já tem conta? <Link href={`/entrar?next=${encodeURIComponent(next)}`} className="font-semibold text-accent hover:underline">Entrar</Link>
      </p>
    </form>
  );
}
