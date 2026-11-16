import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({ page, totalPages, buildHref }: { page: number; totalPages: number; buildHref: (page: number) => string }) {
  if (totalPages <= 1) return null;
  const pages: Array<number | "…"> = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  return (
    <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="Paginação">
      <Link
        href={buildHref(Math.max(1, page - 1))}
        aria-disabled={page === 1}
        className={cn("btn-secondary px-3", page === 1 && "pointer-events-none opacity-40")}
        aria-label="Página anterior"
      >
        <ChevronLeft className="size-4" />
      </Link>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-2 text-subtle">…</span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn("btn min-w-10 px-3", p === page ? "bg-accent text-white" : "border border-line-strong bg-surface-2 text-muted hover:text-fg")}
          >
            {p}
          </Link>
        ),
      )}
      <Link
        href={buildHref(Math.min(totalPages, page + 1))}
        aria-disabled={page === totalPages}
        className={cn("btn-secondary px-3", page === totalPages && "pointer-events-none opacity-40")}
        aria-label="Próxima página"
      >
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}
