import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limit de janela fixa armazenado no Postgres (funciona com várias instâncias/serverless).
 * Em caso de falha do banco, usa um limitador em memória como fallback.
 */
const memory = new Map<string, { start: number; count: number }>();

function memoryLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now - entry.start > windowSeconds * 1000) {
    memory.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return Boolean(data);
  } catch {
    return memoryLimit(key, limit, windowSeconds);
  }
}
