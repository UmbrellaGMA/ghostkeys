import Link from "next/link";
import { ChevronDown, Headphones, ShieldCheck, User, Zap } from "lucide-react";
import { getCategories, getStoreSettings } from "@/services/CatalogService";
import { getCurrentProfile } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { SearchBox } from "./SearchBox";
import { CartButton } from "./CartButton";
import { MobileMenu } from "./MobileMenu";
import { MobileSearch } from "./MobileSearch";
import { Suspense } from "react";

const NAV = [
  { href: "/jogos", label: "Todos os jogos" },
  { href: "/jogos?colecao=promocoes", label: "Promoções" },
  { href: "/jogos?colecao=lancamentos", label: "Lançamentos" },
  { href: "/jogos?colecao=mais-vendidos", label: "Mais vendidos" },
];

export async function Header() {
  // Sem .catch aqui: getCurrentProfile lê cookies e precisa sinalizar renderização dinâmica ao Next
  const [settings, categories, profile] = await Promise.all([getStoreSettings(), getCategories(), getCurrentProfile()]);
  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      {/* Indicadores de confiança */}
      <div className="hidden border-b border-line/70 bg-surface/60 sm:block">
        <div className="container-page flex h-9 items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5">
              <Zap className="size-3.5 text-accent-2" /> Entrega automática após aprovação
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-success" /> Pagamento seguro via Mercado Pago
            </span>
          </div>
          <Link href="/paginas/atendimento" className="flex items-center gap-1.5 hover:text-fg">
            <Headphones className="size-3.5" /> Atendimento{settings.support_hours ? ` · ${settings.support_hours}` : ""}
          </Link>
        </div>
      </div>

      <div className="container-page flex h-16 items-center gap-3 sm:h-[72px] sm:gap-4">
        <Logo name={settings.store_name} className="h-6 min-[400px]:h-7 sm:h-9" />
        <SearchBox className="mx-auto hidden w-full max-w-xl md:block" />
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href={profile ? "/conta" : "/entrar"}
            className="hidden h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-3.5 text-sm font-semibold transition hover:border-accent sm:flex"
          >
            <User className="size-4" />
            <span className="max-w-28 truncate">{profile ? (firstName || "Minha conta") : "Entrar"}</span>
          </Link>
          {profile?.role === "admin" && (
            <Link href="/admin" className="hidden h-11 items-center rounded-xl bg-accent/15 px-3 text-xs font-bold uppercase tracking-wide text-accent hover:bg-accent/25 xl:flex">
              Painel
            </Link>
          )}
          <Suspense fallback={null}>
            <MobileSearch />
          </Suspense>
          <CartButton />
          <MobileMenu links={[{ href: "/", label: "Início" }, ...NAV]} categories={categories} isLoggedIn={Boolean(profile)} />
        </div>
      </div>

      <nav className="hidden border-t border-line/70 lg:block" aria-label="Navegação principal">
        <div className="container-page flex h-11 items-center gap-1 text-sm">
          <div className="group relative">
            <button className="flex h-11 items-center gap-1 rounded-lg px-3 font-semibold text-fg hover:text-accent" aria-haspopup="true">
              Categorias <ChevronDown className="size-4 transition group-hover:rotate-180" />
            </button>
            <div className="invisible absolute left-0 top-full z-50 w-64 translate-y-1 rounded-xl border border-line-strong bg-surface-2 p-2 opacity-0 shadow-2xl transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              {categories.map((c) => (
                <Link key={c.slug} href={`/jogos?categoria=${c.slug}`} className="block rounded-lg px-3 py-2 text-muted hover:bg-surface-3 hover:text-fg">
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
          {NAV.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 font-medium text-muted transition hover:text-fg">
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
