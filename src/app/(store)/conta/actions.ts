"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const nameSchema = z.string().trim().min(3, "Informe seu nome completo").max(120);

/** Atualiza o nome do próprio perfil (RLS + permissão de coluna: o usuário só altera full_name). */
export async function updateProfileName(_prev: { ok?: boolean; error?: string } | null, formData: FormData) {
  const parsed = nameSchema.safeParse(formData.get("full_name"));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada" };
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data }).eq("id", user.id);
  if (error) return { error: "Não foi possível salvar" };
  revalidatePath("/conta");
  return { ok: true };
}
