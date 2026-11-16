"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, FormError } from "@/components/auth/AuthShell";
import { toast } from "@/components/ui/Toaster";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError("A senha deve ter ao menos 8 caracteres, com letras e números.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (error) return setError("Link expirado ou sessão inválida. Solicite uma nova recuperação de senha.");
    toast("Senha alterada com sucesso!");
    router.replace("/conta");
  };

  return (
    <AuthShell title="Criar nova senha">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="password">Nova senha</label>
          <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirmar nova senha</label>
          <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full py-3">
          {loading && <Loader2 className="size-4 animate-spin" />} Salvar nova senha
        </button>
      </form>
    </AuthShell>
  );
}
