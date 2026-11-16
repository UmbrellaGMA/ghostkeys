import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck, ShieldOff } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { Order, Profile } from "@/types";
import { AdminHeader, StatCard, Table } from "@/components/admin/AdminUI";
import { ActionButton } from "@/components/admin/ActionButton";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";
import { setUserRoleAction } from "../../actions";
import { DollarSign, Package } from "lucide-react";

export default async function AdminCustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdminPage();
  const { id } = await params;
  const db = createAdminClient();
  const [{ data: profile }, { data: orders }, authUser] = await Promise.all([
    db.from("profiles").select("*").eq("id", id).maybeSingle(),
    db.from("orders").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    db.auth.admin.getUserById(id).catch(() => null),
  ]);
  if (!profile) notFound();
  const p = profile as Profile;
  const list = (orders ?? []) as Order[];
  const spent = list.filter((o) => ["paid", "processing", "delivered", "delivery_failed"].includes(o.status)).reduce((s, o) => s + o.total_cents, 0);
  const user = authUser?.data?.user;

  return (
    <>
      <Link href="/admin/clientes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <AdminHeader
        title={p.full_name || p.email}
        description={`${p.email} · cadastrado em ${formatDateTime(p.created_at)}`}
        actions={
          p.id === me.id ? null : p.role === "admin" ? (
            <ActionButton action={setUserRoleAction.bind(null, p.id, "customer")} className="btn-danger" confirm="Remover o acesso administrativo deste usuário?">
              <ShieldOff className="size-4" /> Remover admin
            </ActionButton>
          ) : (
            <ActionButton action={setUserRoleAction.bind(null, p.id, "admin")} confirm="Conceder acesso TOTAL ao painel administrativo para este usuário?">
              <ShieldCheck className="size-4" /> Tornar administrador
            </ActionButton>
          )
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pedidos" value={list.length} icon={Package} />
        <StatCard label="Total gasto" value={formatBRL(spent)} icon={DollarSign} tone="success" />
        <div className="card p-5 text-sm">
          <p className="text-muted">Conta</p>
          <p className="mt-2 text-fg">Papel: <strong>{p.role === "admin" ? "Administrador" : "Cliente"}</strong></p>
          <p className="text-fg">E-mail confirmado: <strong>{user?.email_confirmed_at ? "sim" : "não"}</strong></p>
          <p className="text-fg">Último acesso: <strong>{formatDateTime(user?.last_sign_in_at)}</strong></p>
        </div>
      </div>
      <h2 className="mb-3 font-display text-lg font-bold text-white">Compras</h2>
      <Table>
        <thead><tr><th>Pedido</th><th>Data</th><th>Status</th><th className="text-right">Total</th></tr></thead>
        <tbody>
          {list.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/admin/pedidos/${o.id}`} className="font-semibold text-accent hover:underline">#{o.order_number}</Link></td>
              <td className="text-muted">{formatDateTime(o.created_at)}</td>
              <td><OrderStatusBadge status={o.status} /></td>
              <td className="text-right font-semibold text-white">{formatBRL(o.total_cents)}</td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={4} className="py-8 text-center text-muted">Nenhuma compra.</td></tr>}
        </tbody>
      </Table>
    </>
  );
}
