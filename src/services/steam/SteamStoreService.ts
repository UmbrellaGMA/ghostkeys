import type { ApiLogger } from "@/services/shadowkeys/ShadowKeysService";

/**
 * Mídia e textos oficiais da loja Steam (API pública, sem credenciais):
 *   GET https://store.steampowered.com/api/appdetails?appids={appId}&l=brazilian&cc=br
 *
 * Motivo: a ShadowKeys monta a capa como ".../steam/apps/{appId}/header.jpg", formato antigo que
 * retorna 404 para jogos recentes (a Steam passou a usar caminhos com hash). Aqui obtemos a URL
 * correta, uma imagem de fundo, a descrição curta em português e os gêneros em português.
 */
export interface SteamAppMedia {
  headerImage: string | null;
  backgroundImage: string | null;
  shortDescription: string | null;
  genres: string[];
}

export class SteamStoreService {
  constructor(private readonly opts: { fetchImpl?: typeof fetch; logger?: ApiLogger } = {}) {}

  async getAppMedia(appId: string): Promise<SteamAppMedia | null> {
    const started = Date.now();
    const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&l=brazilian&cc=br`;
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(url, { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Record<string, { success: boolean; data?: SteamAppData }>;
      const entry = json?.[appId];
      if (!entry?.success || !entry.data) {
        await this.log("appdetails", "error", res.status, started, `appId=${appId} sem dados`);
        return null;
      }
      const d = entry.data;
      const screenshot = d.screenshots?.[0]?.path_full ?? null;
      await this.log("appdetails", "success", res.status, started, `appId=${appId}`);
      return {
        headerImage: d.header_image ?? null,
        backgroundImage: screenshot ?? d.background_raw ?? d.background ?? null,
        shortDescription: d.short_description ? decodeEntities(d.short_description).trim() : null,
        genres: (d.genres ?? []).map((g) => g.description).filter(Boolean),
      };
    } catch (e) {
      await this.log("appdetails", "error", null, started, `appId=${appId}: ${(e as Error).message}`);
      return null;
    }
  }

  private async log(operation: string, s: "success" | "error", http: number | null, started: number, summary: string) {
    try {
      await this.opts.logger?.log({ provider: "steam", operation, request_status: s, http_status: http, duration_ms: Date.now() - started, response_summary: summary });
    } catch {
      /* ignore */
    }
  }
}

interface SteamAppData {
  header_image?: string;
  background_raw?: string;
  background?: string;
  short_description?: string;
  genres?: Array<{ id: string; description: string }>;
  screenshots?: Array<{ path_full: string }>;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** A imagem pode ser substituída automaticamente? (não sobrescreve uploads feitos pelo admin) */
export function isReplaceableImage(url: string | null | undefined): boolean {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return host.endsWith("steamstatic.com") || host.endsWith("akamaihd.net");
  } catch {
    return true;
  }
}
