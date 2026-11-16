import { describe, expect, it } from "vitest";
import { ShadowKeysError, ShadowKeysService, type ApiLogEntry } from "@/services/shadowkeys/ShadowKeysService";
import { mockFetch } from "./helpers/fakes";

function client(responses: Array<{ status: number; body: unknown }>) {
  const { fetch, requests } = mockFetch(responses);
  const logs: ApiLogEntry[] = [];
  const sk = new ShadowKeysService({ baseUrl: "https://revenda.shadowkeys.com.br/api/v1/", token: "sk_live_SECRET", fetchImpl: fetch, logger: { log: (e) => void logs.push(e) } });
  return { sk, requests, logs };
}

describe("ShadowKeysService (conforme documentação oficial v1)", () => {
  it("GET /games com paginação e Bearer token", async () => {
    const { sk, requests } = client([{ status: 200, body: { games: [], total: 0, page: 2, pageSize: 50, totalPages: 0 } }]);
    await sk.listGames({ page: 2, search: "elden" });
    expect(requests[0]!.url).toBe("https://revenda.shadowkeys.com.br/api/v1/games?page=2&search=elden");
    expect((requests[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_SECRET");
  });

  it("percorre todas as páginas do catálogo", async () => {
    const g = (id: string) => ({ appId: id, name: id, coverUrl: null, shortDescription: null, developer: null, publisher: null, releaseDate: null, nsfw: false, priceCents: 500 });
    const { sk } = client([
      { status: 200, body: { games: [g("1"), g("2")], total: 3, page: 1, pageSize: 2, totalPages: 2 } },
      { status: 200, body: { games: [g("3")], total: 3, page: 2, pageSize: 2, totalPages: 2 } },
    ]);
    expect((await sk.listAllGames()).map((x) => x.appId)).toEqual(["1", "2", "3"]);
  });

  it("POST /keys/generate com o corpo documentado e sem importIfMissing", async () => {
    const { sk, requests } = client([
      { status: 200, body: { generated: 1, totalCents: 500, chargedCentsPerKey: 500, gamesPerKey: 1, isCombo: false, imported: [], keys: [{ id: "k1", code: "AAAAA-BBBBB-CCCCC-DDDDD", gameIds: ["1245620"], gameNames: ["Elden Ring"], isCombo: false, chargedCents: 500 }] } },
    ]);
    const r = await sk.generateKeys({ appId: "1245620", quantity: 1, codeLength: 20 });
    expect(r.keys[0]!.code).toBe("AAAAA-BBBBB-CCCCC-DDDDD");
    expect(requests[0]!.url).toBe("https://revenda.shadowkeys.com.br/api/v1/keys/generate");
    expect(requests[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({ appId: "1245620", quantity: 1, codeLength: 20, importIfMissing: false });
  });

  it("nunca registra o código da key nem o token nos logs", async () => {
    const { sk, logs } = client([
      { status: 200, body: { generated: 1, totalCents: 0, chargedCentsPerKey: 0, gamesPerKey: 1, isCombo: false, imported: [], keys: [{ id: "k1", code: "SEGREDO-KEY", gameIds: [], gameNames: [], isCombo: false, chargedCents: 0 }] } },
    ]);
    await sk.generateKeys({ appId: "1", quantity: 1 });
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain("SEGREDO-KEY");
    expect(dump).not.toContain("sk_live_SECRET");
    expect(dump).toContain("keyIds=k1");
  });

  it("402 (saldo insuficiente) não é retentado e não é marcado como temporário", async () => {
    const { sk, requests } = client([{ status: 402, body: { message: "Saldo insuficiente" } }]);
    const err = await sk.generateKeys({ appId: "1", quantity: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ShadowKeysError);
    expect(err.status).toBe(402);
    expect(err.retryable).toBe(false);
    expect(err.friendly).toMatch(/Saldo insuficiente/);
    expect(requests).toHaveLength(1);
  });

  it("geração de keys nunca é retentada automaticamente pelo cliente HTTP (evita compra dupla)", async () => {
    const { sk, requests } = client([{ status: 503, body: { message: "indisponível" } }, { status: 200, body: {} }]);
    const err = await sk.generateKeys({ appId: "1", quantity: 1 }).catch((e) => e);
    expect(err.retryable).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it("leituras (GET) são retentadas em 5xx", async () => {
    const { sk, requests } = client([
      { status: 503, body: { message: "x" } },
      { status: 200, body: { appId: "1", name: "X", tags: ["RPG"], priceCents: 100 } },
    ]);
    const g = await sk.getGame("1");
    expect(g.tags).toEqual(["RPG"]);
    expect(requests).toHaveLength(2);
  });

  it("valida quantidade (1–100)", async () => {
    const { sk } = client([]);
    expect(() => sk.generateKeys({ appId: "1", quantity: 0 })).toThrow(ShadowKeysError);
    expect(() => sk.generateKeys({ appId: "1", quantity: 101 })).toThrow(ShadowKeysError);
  });
});
