import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, requireEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Cliente com Service Role: IGNORA RLS. Usar somente no servidor, depois de
 * validar autenticação/autorização. Nunca importar em componentes de cliente.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(publicEnv.supabaseUrl || requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
