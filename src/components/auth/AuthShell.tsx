import { LogoMark } from "@/components/ui/Logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="container-page grid min-h-[70dvh] place-items-center py-12">
      <div className="card relative w-full max-w-md overflow-hidden p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-accent/15 blur-3xl" />
        <LogoMark className="relative mb-5 size-11" />
        <h1 className="relative font-display text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="relative mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="relative mt-6">{children}</div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-red-200">
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-xl border border-success/40 bg-success/10 px-3 py-2.5 text-sm text-green-200">
      {message}
    </p>
  );
}
