import { discountPercent, formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

export function PriceTag({
  price,
  listPrice,
  size = "md",
  className,
}: {
  price: number;
  listPrice?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const pct = discountPercent(listPrice, price);
  return (
    <div className={cn("flex flex-wrap items-end gap-x-2 gap-y-0.5", className)}>
      {pct > 0 && (
        <span className={cn("badge bg-success/15 text-success", size === "lg" && "px-2.5 py-1 text-sm")}>-{pct}%</span>
      )}
      <div className="flex flex-col leading-tight">
        {pct > 0 && <span className={cn("text-subtle line-through", size === "lg" ? "text-sm" : "text-xs")}>{formatBRL(listPrice)}</span>}
        <span
          className={cn(
            "font-display font-bold text-white",
            size === "sm" && "text-base",
            size === "md" && "text-lg",
            size === "lg" && "text-3xl sm:text-4xl",
          )}
        >
          {formatBRL(price)}
        </span>
      </div>
    </div>
  );
}
