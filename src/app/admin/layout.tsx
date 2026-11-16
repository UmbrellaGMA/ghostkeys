import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth";
import { AdminMobileNav, AdminSidebar } from "@/components/admin/AdminNav";

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

/** Painel independente da loja. Acesso exige papel "admin" lido do banco (não do cliente). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdminPage();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <AdminSidebar email={profile.email} />
      <AdminMobileNav email={profile.email} />
      {/* No celular, espaço inferior para a barra de abas (+ área do indicador do iPhone) */}
      <main className="min-w-0 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-8 lg:pb-8">{children}</main>
    </div>
  );
}
