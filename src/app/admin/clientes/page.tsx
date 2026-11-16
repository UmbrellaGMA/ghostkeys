import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import type { Profile } from "@/types";
import { AdminHeader, Table } from "@/components/admin/AdminUI";
import { Pagination } from "@/components/catalog/Pagination";

const PER_PAGE = 30;

export default async function AdminCustomers({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const db = createAdminClient();
  let q = db.from("profiles").select("*, orders(count)", { count: "exact" });
  if (sp.q) {
    const term = sp.q.replace(/[\\%_,()]/g, "");
    q = q.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  }
  const { data, count } = await q.order("created_at", { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const customers = (data ?? []) as Array<Profile & { orders: Array<{ count: number }> }>;

  return (
    <>
      <AdminHeader title="Clientes" description={`${count ?? 0} conta(s) cadastrada(s)`} />
      <form className="mb-4 flex gap-2" action="/admin/clientes">
        <input name="q" defaultValue={sp.q} placeholder="Nome ou e-mail" className="input max-w-xs" />
        <button className="btn-secondary">Buscar</button>
      </form>
      <Table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Pedidos</th><th>Cadastro</th><th></th></tr></thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td className="font-semibold text-fg">{c.full_name || "—"}</td>
              <td>{c.email}</td>
              <td>{c.role === "admin" ? <span className="badge bg-accent/15 text-accent">Admin</span> : <span className="text-muted">Cliente</span>}</td>
              <td>{c.orders?.[0]?.count ?? 0}</td>
              <td className="text-muted">{formatDateTime(c.created_at)}</td>
              <td><Link href={`/admin/clientes/${c.id}`} className="text-sm font-semibold text-accent hover:underline">Ver</Link></td>
            </tr>
          ))}
          {!customers.length && <tr><td colSpan={6} className="py-10 text-center text-muted">Nenhum cliente encontrado.</td></tr>}
        </tbody>
      </Table>
      <Pagination page={page} totalPages={Math.ceil((count ?? 0) / PER_PAGE)} buildHref={(p) => `/admin/clientes?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`} />
    </>
  );
}
