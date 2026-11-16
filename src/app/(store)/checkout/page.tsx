import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false } };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  return (
    <div className="container-page py-8">
      <h1 className="mb-6 font-display text-3xl font-bold text-white">Finalizar compra</h1>
      <CheckoutForm email={user.email!} defaultName={profile?.full_name ?? (user.user_metadata?.full_name as string) ?? ""} />
    </div>
  );
}
