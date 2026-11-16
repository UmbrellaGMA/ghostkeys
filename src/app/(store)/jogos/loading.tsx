import { ProductGridSkeleton } from "@/components/product/ProductCard";

export default function Loading() {
  return (
    <div className="container-page py-8">
      <div className="skeleton mb-2 h-9 w-64" />
      <div className="skeleton mb-6 h-4 w-40" />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="skeleton hidden h-[480px] lg:block" />
        <ProductGridSkeleton count={12} />
      </div>
    </div>
  );
}
