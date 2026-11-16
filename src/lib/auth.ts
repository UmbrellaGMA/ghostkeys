import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile) ?? null;
}

export async function requireUser(next = "/conta") {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return user;
}

export class AuthorizationError extends Error {
  constructor(message = "Acesso negado") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Para Server Actions/Route Handlers: lança erro se não for admin. O papel é lido do banco, nunca do cliente. */
export async function assertAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") throw new AuthorizationError();
  return profile;
}

/** Para páginas do painel: redireciona quem não é admin. */
export async function requireAdminPage(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/entrar?next=/admin");
  if (profile.role !== "admin") redirect("/");
  return profile;
}
