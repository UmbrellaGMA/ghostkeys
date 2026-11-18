"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface WeekOption {
  weekStart: string;
  label: string;
  sales: number;
  commissionCents: number;
  paid: boolean;
}

/** Alterna entre semanas: anterior / seguinte + lista das semanas com vendas. */
export function WeekPicker({
  basePath,
  current,
  currentLabel,
  prev,
  next,
  options,
}: {
  basePath: string;
  current: string;
  currentLabel: string;
  prev: string;
  next: string | null;
  options: WeekOption[];
}) {
  const router = useRouter();
  const href = (w: string) => `${basePath}?semana=${w}`;
  const list = options.some((o) => o.weekStart === current) ? options : [{ weekStart: current, label: currentLabel, sales: 0, commissionCents: 0, paid: false }, ...options];

  return (
    <div className="flex items-center gap-2">
      <Link href={href(prev)} className="btn-secondary min-h-11 shrink-0 px-3" aria-label="Semana anterior" scroll={false}>
        <ChevronLeft className="size-5" />
      </Link>
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Escolher semana</span>
        <select
          className="input min-h-11 w-full cursor-pointer appearance-none pr-8 text-center font-semibold"
          value={current}
          onChange={(e) => router.push(href(e.target.value), { scroll: false })}
        >
          {list
            .slice()
            .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
            .map((o) => (
              <option key={o.weekStart} value={o.weekStart}>
                {o.label}
                {o.sales ? ` · ${o.sales} venda(s) · ${formatBRL(o.commissionCents)}${o.paid ? " · paga" : ""}` : ""}
              </option>
            ))}
        </select>
      </label>
      {next ? (
        <Link href={href(next)} className="btn-secondary min-h-11 shrink-0 px-3" aria-label="Semana seguinte" scroll={false}>
          <ChevronRight className="size-5" />
        </Link>
      ) : (
        <span className={cn("btn-secondary min-h-11 shrink-0 cursor-not-allowed px-3 opacity-40")} aria-disabled="true" aria-label="Semana seguinte">
          <ChevronRight className="size-5" />
        </span>
      )}
    </div>
  );
}
