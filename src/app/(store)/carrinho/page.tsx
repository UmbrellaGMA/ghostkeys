import type { Metadata } from "next";
import { CartView } from "./CartView";

export const metadata: Metadata = { title: "Carrinho", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="container-page py-8">
      <h1 className="mb-6 font-display text-3xl font-bold text-white">Carrinho</h1>
      <CartView />
    </div>
  );
}
