"use client";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updateProfileName } from "./actions";

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const [state, action, pending] = useActionState(updateProfileName, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="full_name">Nome completo</label>
        <input id="full_name" name="full_name" defaultValue={fullName} className="input" required minLength={3} maxLength={120} />
      </div>
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" value={email} readOnly className="input cursor-not-allowed opacity-70" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending && <Loader2 className="size-4 animate-spin" />} Salvar
        </button>
        {state?.ok && <span className="text-sm text-success">Dados atualizados.</span>}
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
