import Link from "next/link";
import { Package, User } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { SignOutButton } from "@/components/account/SignOutButton";

export const metadata = { robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/conta");
  return (
    <div className="container-page grid gap-5 py-6 sm:gap-6 sm:py-8 lg:grid-cols-[220px_1fr]">
      <aside className="card h-fit p-2">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          <Link href="/conta" className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm text-fg hover:bg-surface-2">
            <User className="size-4 text-accent" /> Meu perfil
          </Link>
          <Link href="/conta/pedidos" className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm text-fg hover:bg-surface-2">
            <Package className="size-4 text-accent" /> Pedidos e keys
          </Link>
          <SignOutButton className="whitespace-nowrap" />
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
