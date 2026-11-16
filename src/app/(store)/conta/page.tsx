import Link from "next/link";
import { KeyRound, Lock, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { Order } from "@/types";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";
import { ProfileForm } from "./ProfileForm";

export const metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const user = await requireUser("/conta");
  const supabase = await createClient();
  const [{ data: profile }, { data: orders }, { count: deliveredCount }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, created_at").eq("id", user.id).single(),
    supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "delivered"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold text-white">Olá, {profile?.full_name?.split(" ")[0] || "jogador(a)"}!</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/conta/pedidos" className="card flex items-center gap-4 p-5 transition hover:border-accent/50">
          <Package className="size-8 text-accent" />
          <div>
            <p className="text-sm text-muted">Pedidos entregues</p>
            <p className="font-display text-2xl font-bold text-white">{deliveredCount ?? 0}</p>
          </div>
        </Link>
        <Link href="/conta/pedidos" className="card flex items-center gap-4 p-5 transition hover:border-accent/50">
          <KeyRound className="size-8 text-accent-2" />
          <div>
            <p className="text-sm text-muted">Minhas keys</p>
            <p className="font-semibold text-white">Ver pedidos e keys →</p>
          </div>
        </Link>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-white">Perfil</h2>
        <ProfileForm fullName={profile?.full_name ?? ""} email={profile?.email ?? user.email!} />
        <div className="mt-5 border-t border-line pt-5">
          <Link href="/recuperar-senha" className="inline-flex items-center gap-2 text-sm text-accent hover:underline">
            <Lock className="size-4" /> Alterar senha
          </Link>
        </div>
      </section>

      <section className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">Pedidos recentes</h2>
          <Link href="/conta/pedidos" className="text-sm text-accent hover:underline">Ver todos</Link>
        </div>
        {!orders?.length ? (
          <p className="text-sm text-muted">Você ainda não fez pedidos. <Link href="/jogos" className="text-accent hover:underline">Explorar jogos</Link></p>
        ) : (
          <ul className="divide-y divide-line">
            {(orders as Order[]).map((o) => (
              <li key={o.id}>
                <Link href={`/conta/pedidos/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:text-white">
                  <span className="text-sm">
                    <strong className="text-fg">#{o.order_number}</strong> <span className="text-muted">· {formatDateTime(o.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <OrderStatusBadge status={o.status} />
                    <span className="font-semibold text-white">{formatBRL(o.total_cents)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
