import { describe, expect, it } from "vitest";
import { parseReleaseDate } from "@/lib/dates";
import { parseImportLine, pickBestMatch, searchVariants, simplifyName, withSlugs } from "@/services/CatalogSyncService";
import type { SKGameSummary } from "@/services/shadowkeys/types";

describe("Datas de lançamento do fornecedor", () => {
  it("formato real da API ShadowKeys (pt-BR abreviado)", () => {
    expect(parseReleaseDate("18 mar. 2021")).toBe("2021-03-18");
    expect(parseReleaseDate("5 jun. 2018")).toBe("2018-06-05");
    expect(parseReleaseDate("11 dez. 2015")).toBe("2015-12-11");
    expect(parseReleaseDate("22 fev. 2012")).toBe("2012-02-22");
    expect(parseReleaseDate("9 mai. 2024")).toBe("2024-05-09");
  });

  it("formatos alternativos", () => {
    expect(parseReleaseDate("2022-02-25")).toBe("2022-02-25");
    expect(parseReleaseDate("18 de março de 2021")).toBe("2021-03-18");
    expect(parseReleaseDate("Mar 18, 2021")).toBe("2021-03-18");
    expect(parseReleaseDate("18/03/2021")).toBe("2021-03-18");
  });

  it("valores vazios ou desconhecidos viram null", () => {
    for (const v of ["", null, undefined, "Em breve", "Q3 2026", "2021", "31 fev. 2021"]) expect(parseReleaseDate(v)).toBeNull();
  });
});

describe("Preparação da página para o upsert", () => {
  const g = (appId: string, name: string, releaseDate: string | null = null): SKGameSummary => ({
    appId, name, coverUrl: null, shortDescription: null, developer: null, publisher: null, releaseDate, nsfw: false, priceCents: 300,
  });

  it("gera slugs amigáveis, fallback para nomes não latinos e desambigua repetidos", () => {
    const out = withSlugs([g("1", "Elden Ring"), g("2", "구이몽"), g("3", "Elden Ring")]);
    expect(out.map((x) => x.slug)).toEqual(["elden-ring", "jogo-2", "elden-ring-3"]);
  });

  it("normaliza a data para ISO", () => {
    expect(withSlugs([g("1", "X", "18 mar. 2021")])[0]!.releaseDate).toBe("2021-03-18");
  });
});

describe("Importação por lista: interpretação e escolha do jogo", () => {
  const g = (appId: string, name: string): SKGameSummary => ({ appId, name, coverUrl: null, shortDescription: null, developer: null, publisher: null, releaseDate: null, nsfw: false, priceCents: 300 });

  it("lê nome e preço da linha", () => {
    expect(parseImportLine("Elden Ring; 34,90")).toEqual({ query: "Elden Ring", priceCents: 3490 });
    expect(parseImportLine("NBA 2K27")).toEqual({ query: "NBA 2K27", priceCents: null });
    expect(parseImportLine("1259420\t24,90")).toEqual({ query: "1259420", priceCents: 2490 });
  });

  it("simplifica nomes de outras lojas", () => {
    expect(simplifyName("Hollow Knight - Edição Completa")).toBe("Hollow Knight");
    expect(simplifyName("Grounded - Edição Padrão")).toBe("Grounded");
    expect(simplifyName("Fifa 22 + DLCS")).toBe("Fifa 22");
    expect(simplifyName("The Last of Us™ Part I")).toBe("The Last of Us Part I");
    expect(simplifyName("Call of Duty®: Modern Warfare® Remastered (2017) — Campanha")).toBe("Call of Duty: Modern Warfare Remastered");
    expect(searchVariants("Marvel’s Spider-Man Remastered")).toContain("Marvel s Spider-Man Remastered");
  });

  it("nome exato vence, inclusive com símbolos diferentes", () => {
    const r = pickBestMatch("ELDEN RING™", [g("1", "ELDEN RING Nightreign"), g("2", "ELDEN RING")]);
    expect(r).toMatchObject({ kind: "match", game: { appId: "2" } });
  });

  it("descarta trilhas sonoras/DLC/packs quando sobra um único jogo base", () => {
    const r = pickBestMatch("The Witcher 3: Wild Hunt", [
      g("1233340", "The Witcher 3: Wild Hunt - Blood and Wine Soundtrack"),
      g("292030", "The Witcher 3: Wild Hunt — Remastered"),
      g("1229320", "The Witcher 3: Wild Hunt — Remastered Soundtrack"),
    ]);
    expect(r).toMatchObject({ kind: "match", game: { appId: "292030" } });
  });

  it("continua pedindo escolha quando há mais de um jogo base", () => {
    expect(pickBestMatch("Dark Souls", [g("1", "DARK SOULS II"), g("2", "DARK SOULS III")]).kind).toBe("ambiguous");
  });
});
