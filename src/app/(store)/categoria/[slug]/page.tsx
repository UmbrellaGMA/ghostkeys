import { permanentRedirect } from "next/navigation";

/** URL amigável /categoria/rpg → catálogo filtrado. */
export default async function CategoryRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/jogos?categoria=${encodeURIComponent(slug)}`);
}
