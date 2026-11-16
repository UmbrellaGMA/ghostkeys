import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = "accent", hint }: { label: string; value: string | number; icon: LucideIcon; tone?: "accent" | "success" | "warning" | "danger"; hint?: string }) {
  const tones = { accent: "text-accent bg-accent/15", success: "text-success bg-success/15", warning: "text-warning bg-warning/15", danger: "text-danger bg-danger/15" };
  return (
    <div className="card min-w-0 p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-snug text-muted sm:text-sm">{label}</p>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg sm:size-9", tones[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 truncate font-display text-lg font-bold text-white sm:mt-3 sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 hidden text-xs text-subtle sm:block">{hint}</p>}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted [&_thead]:border-b [&_thead]:border-line [&_tbody_tr]:border-b [&_tbody_tr]:border-line/60 [&_tbody_tr:hover]:bg-surface-2/60">
        {children}
      </table>
    </div>
  );
}
