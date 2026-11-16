"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import type { ActionResult } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

/** Botão que executa uma Server Action administrativa com confirmação e feedback visual. */
export function ActionButton({
  action,
  children,
  confirm,
  className = "btn-secondary",
  disabled,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  confirm?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending || disabled}
      className={cn(className)}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          toast(r.message, r.ok ? "success" : "error");
          router.refresh();
        });
      }}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Toggle({ checked, action, label }: { checked: boolean; action: (v: boolean) => Promise<ActionResult>; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await action(!checked);
          if (!r.ok) toast(r.message, "error");
          router.refresh();
        })
      }
      className={cn("relative h-6 w-11 rounded-full transition", checked ? "bg-accent" : "bg-surface-3", pending && "opacity-50")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}
