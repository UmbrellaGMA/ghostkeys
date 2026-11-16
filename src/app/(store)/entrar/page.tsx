import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/conta";
  return (
    <AuthShell title="Entrar na sua conta" subtitle="Acesse seus pedidos e keys.">
      <LoginForm next={next} linkError={sp.erro === "link-invalido"} />
    </AuthShell>
  );
}
