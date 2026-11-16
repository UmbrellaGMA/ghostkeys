import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Bell, BookOpen, FileText, Gamepad2, Layers, Package, PlusCircle, Settings, Store, Tag, Users } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { LogoMark } from "@/components/ui/Logo";
import { SignOutButton } from "@/components/account/SignOutButton";

export const metadata: Metadata = {
  title: "Painel administrativo",
  robots: { index: false, follow: false },
  // App instalável (iPhone: Safari › Compartilhar › Adicionar à Tela de Início) com notificações push
  manifest: "/admin.webmanifest",
  applicationName: "GK Admin",
  appleWebApp: { capable: true, title: "GK Admin", statusBarStyle: "black" },
  icons: { apple: "/pwa/apple-touch-icon.png" },
};
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: BarChart3 },
  { href: "/admin/pedidos", label: "Pedidos", icon: Package },
  { href: "/admin/notificacoes", label: "Notificações", icon: Bell },
  { href: "/admin/produtos", label: "Produtos", icon: Gamepad2 },
  { href: "/admin/produtos/importar", label: "Adicionar jogos", icon: PlusCircle },
  { href: "/admin/categorias", label: "Categorias", icon: Layers },
  { href: "/admin/cupons", label: "Cupons", icon: Tag },
  { href: "/admin/tutoriais", label: "Tutoriais de ativação", icon: BookOpen },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
  { href: "/admin/logs", label: "Logs", icon: FileText },
];

/** Painel independente da loja. Acesso exige papel "admin" lido do banco (não do cliente). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdminPage();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <LogoMark className="size-8" />
          <span className="font-display font-bold text-white">Painel</span>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-line px-3 py-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <p className="truncate px-3 pb-2 text-xs text-subtle">{profile.email}</p>
          <Link href="/" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
            <Store className="size-4" /> Ver loja
          </Link>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-8">{children}</main>
    </div>
  );
}
