import { describe, expect, it } from "vitest";
import { isReplaceableImage, SteamStoreService } from "@/services/steam/SteamStoreService";
import { mockFetch } from "./helpers/fakes";

describe("SteamStoreService (capas e textos oficiais)", () => {
  it("extrai capa, fundo (1ª captura), descrição em português e gêneros", async () => {
    const { fetch, requests } = mockFetch([
      {
        status: 200,
        body: {
          "4356430": {
            success: true,
            data: {
              header_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4356430/abc/header.jpg?t=1",
              background_raw: "https://shared.akamai.steamstatic.com/.../page_bg_raw.jpg",
              short_description: "A corrida n&atilde;o para &amp; <b>nunca</b> termina.",
              genres: [{ id: "18", description: "Esportes" }],
              screenshots: [{ path_full: "https://shared.akamai.steamstatic.com/.../ss_1.jpg" }],
            },
          },
        },
      },
    ]);
    const m = await new SteamStoreService({ fetchImpl: fetch }).getAppMedia("4356430");
    expect(requests[0]!.url).toContain("appids=4356430&l=brazilian&cc=br");
    expect(m).toMatchObject({
      headerImage: expect.stringContaining("/abc/header.jpg"),
      backgroundImage: expect.stringContaining("ss_1.jpg"),
      genres: ["Esportes"],
    });
    expect(m!.shortDescription).toContain("& nunca termina");
  });

  it("retorna null quando a Steam não tem o app ou está fora do ar", async () => {
    expect(await new SteamStoreService({ fetchImpl: mockFetch([{ status: 200, body: { "1": { success: false } } }]).fetch }).getAppMedia("1")).toBeNull();
    expect(await new SteamStoreService({ fetchImpl: mockFetch([{ status: 503, body: {} }]).fetch }).getAppMedia("1")).toBeNull();
  });

  it("só substitui imagens da Steam (nunca uploads do admin)", () => {
    expect(isReplaceableImage(null)).toBe(true);
    expect(isReplaceableImage("https://shared.cloudflare.steamstatic.com/steam/apps/1/header.jpg")).toBe(true);
    expect(isReplaceableImage("https://hjakeplbyjecvzvzswlc.supabase.co/storage/v1/object/public/product-images/x.webp")).toBe(false);
  });
});
