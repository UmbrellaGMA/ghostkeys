import type { ActivationTutorial } from "@/types";

const norm = (s: string) => s.trim().toLowerCase();

/** Tutorial da plataforma informada; se não houver, o tutorial padrão. */
export function pickTutorial(tutorials: ActivationTutorial[], platform: string | null | undefined): ActivationTutorial | null {
  const active = tutorials.filter((t) => t.active);
  if (platform) {
    const match = active.find((t) => norm(t.platform) === norm(platform));
    if (match) return match;
  }
  return active.find((t) => t.is_default) ?? null;
}

/** Tutoriais (sem repetição) para as plataformas de um pedido. */
export function tutorialsForPlatforms(tutorials: ActivationTutorial[], platforms: string[]): ActivationTutorial[] {
  const out = new Map<string, ActivationTutorial>();
  for (const p of platforms) {
    const t = pickTutorial(tutorials, p);
    if (t) out.set(t.id, t);
  }
  return [...out.values()];
}

/** Converte links do YouTube em URL de incorporação; outros links retornam null (exibidos como link). */
export function youtubeEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/);
        id = m?.[1] ?? null;
      }
    }
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}
