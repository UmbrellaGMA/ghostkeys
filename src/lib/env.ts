/**
 * Acesso centralizado às variáveis de ambiente.
 * Variáveis sem prefixo NEXT_PUBLIC_ só existem no servidor.
 */

export class MissingConfigError extends Error {
  constructor(public readonly variable: string) {
    super(`Variável de ambiente ausente: ${variable}`);
    this.name = "MissingConfigError";
  }
}

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function optionalEnv(name: string): string | undefined {
  return read(name);
}

export function requireEnv(name: string): string {
  const v = read(name);
  if (!v) throw new MissingConfigError(name);
  return v;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  mercadoPagoPublicKey: process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? "",
};

export function appUrl(): string {
  return (read("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");
}

export function maskSecret(value: string | undefined): string {
  if (!value) return "—";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

export type IntegrationStatus = { name: string; configured: boolean; detail: string; missing: string[] };

/** Estado das integrações (sem expor valores). Usado no painel administrativo. */
export function integrationsStatus(): IntegrationStatus[] {
  const check = (name: string, vars: string[], detail: (v: Record<string, string | undefined>) => string): IntegrationStatus => {
    const values = Object.fromEntries(vars.map((k) => [k, read(k)]));
    const missing = vars.filter((k) => !values[k]);
    return { name, configured: missing.length === 0, detail: detail(values), missing };
  };
  return [
    check("Supabase", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"], (v) =>
      v.NEXT_PUBLIC_SUPABASE_URL ? `Projeto: ${v.NEXT_PUBLIC_SUPABASE_URL}` : "Não configurado",
    ),
    check("Mercado Pago", ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_PUBLIC_KEY", "MERCADOPAGO_WEBHOOK_SECRET"], (v) => {
      const t = v.MERCADOPAGO_ACCESS_TOKEN;
      if (!t) return "Token não configurado";
      return `${t.startsWith("TEST-") ? "Modo TESTE" : "Modo PRODUÇÃO"} · token ${maskSecret(t)}`;
    }),
    check("ShadowKeys", ["SHADOWKEYS_API_URL", "SHADOWKEYS_API_TOKEN"], (v) => {
      const mode = read("SHADOWKEYS_MODE") === "sandbox" ? "SANDBOX (keys fictícias de teste)" : "LIVE";
      return `Modo ${mode} · token ${maskSecret(v.SHADOWKEYS_API_TOKEN)}`;
    }),
    check("Criptografia das keys", ["KEYS_ENCRYPTION_SECRET"], () => "AES-256-GCM"),
    check("E-mail (Resend)", ["RESEND_API_KEY", "EMAIL_FROM"], (v) => (v.EMAIL_FROM ? `Remetente: ${v.EMAIL_FROM}` : "Não configurado")),
    check("Agendador (cron)", ["CRON_SECRET"], () => "Endpoints /api/cron/*"),
    check("Notificações push (app do admin)", ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"], () => "Ative em Painel › Notificações"),
  ];
}

export function shadowKeysMode(): "live" | "sandbox" {
  const mode = read("SHADOWKEYS_MODE") === "sandbox" ? "sandbox" : "live";
  if (mode === "sandbox" && process.env.NODE_ENV === "production" && read("ALLOW_SANDBOX_IN_PRODUCTION") !== "true") {
    throw new Error("SHADOWKEYS_MODE=sandbox não é permitido em produção.");
  }
  return mode;
}
