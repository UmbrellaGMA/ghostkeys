"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Eye, Loader2, Plus, Trash2, X } from "lucide-react";
import type { ActivationTutorial as Tutorial } from "@/types";
import { ActivationTutorial } from "@/components/account/ActivationTutorial";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { deleteTutorialAction, saveTutorialAction } from "../actions";

type Form = {
  platform: string;
  title: string;
  intro: string;
  steps: string[];
  activation_url: string;
  video_url: string;
  notes: string;
  is_default: boolean;
  active: boolean;
  sort_order: string;
};

const fromTutorial = (t: Tutorial | null, platform = ""): Form => ({
  platform: t?.platform ?? platform,
  title: t?.title ?? (platform ? `Como ativar sua key na ${platform}` : ""),
  intro: t?.intro ?? "",
  steps: t?.steps.length ? [...t.steps] : [""],
  activation_url: t?.activation_url ?? "",
  video_url: t?.video_url ?? "",
  notes: t?.notes ?? "",
  is_default: t?.is_default ?? false,
  active: t?.active ?? true,
  sort_order: String(t?.sort_order ?? 0),
});

export function TutorialEditor({ tutorial, defaultPlatform = "" }: { tutorial: Tutorial | null; defaultPlatform?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(tutorial !== null || defaultPlatform !== "");
  const [f, setF] = useState<Form>(() => fromTutorial(tutorial, defaultPlatform));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const setStep = (i: number, v: string) => set("steps", f.steps.map((s, j) => (j === i ? v : s)));
  const removeStep = (i: number) => set("steps", f.steps.length > 1 ? f.steps.filter((_, j) => j !== i) : [""]);
  const moveStep = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= f.steps.length) return;
    const next = [...f.steps];
    [next[i], next[j]] = [next[j], next[i]];
    set("steps", next);
  };

  const preview: Tutorial = {
    id: tutorial?.id ?? "preview",
    platform: f.platform || "plataforma",
    title: f.title || "Título do tutorial",
    intro: f.intro || null,
    steps: f.steps.map((s) => s.trim()).filter(Boolean),
    activation_url: f.activation_url.startsWith("https://") ? f.activation_url : null,
    video_url: f.video_url.startsWith("https://") ? f.video_url : null,
    notes: f.notes || null,
    is_default: f.is_default,
    active: f.active,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveTutorialAction(tutorial?.id ?? null, { ...f });
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        if (!tutorial) {
          setF(fromTutorial(null));
          setOpen(false);
        }
        router.refresh();
      }
    });
  };

  const remove = () => {
    if (!tutorial || !confirm(`Excluir o tutorial "${tutorial.title}"?`)) return;
    start(async () => {
      const r = await deleteTutorialAction(tutorial.id);
      toast(r.message, r.ok ? "success" : "error");
      router.refresh();
    });
  };

  if (!tutorial && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="card flex w-full items-center justify-center gap-2 border-dashed p-5 text-sm font-semibold text-muted hover:text-fg">
        <Plus className="size-4" /> Novo tutorial (outra plataforma)
      </button>
    );
  }

  return (
    <form onSubmit={save} className={cn("card p-6", !tutorial && "border-dashed")}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-bold text-white">
          {tutorial ? tutorial.platform : "Novo tutorial"}
          {tutorial?.is_default && <span className="badge bg-accent/20 text-accent-2">Padrão</span>}
          {tutorial && !tutorial.active && <span className="badge bg-surface-3 text-muted">Oculto</span>}
        </h2>
        {!tutorial && (
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-3" aria-label="Cancelar">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div>
              <label className="label">Plataforma</label>
              <input className="input" value={f.platform} onChange={(e) => set("platform", e.target.value)} placeholder="Steam" required />
            </div>
            <div>
              <label className="label">Título</label>
              <input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Como ativar sua key na Steam" required />
            </div>
          </div>

          <div>
            <label className="label">Introdução (opcional)</label>
            <textarea className="input min-h-16" value={f.intro} onChange={(e) => set("intro", e.target.value)} placeholder="Ex.: Leva menos de 1 minuto. Você precisa de uma conta Steam." />
          </div>

          <div>
            <label className="label">Passo a passo</label>
            <ol className="space-y-2">
              {f.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-bold text-accent-2">{i + 1}</span>
                  <textarea
                    className="input min-h-10 flex-1 resize-y py-2"
                    rows={1}
                    value={s}
                    onChange={(e) => setStep(i, e.target.value)}
                    placeholder={i === 0 ? "Abra o aplicativo da Steam e entre na sua conta." : "Próximo passo..."}
                  />
                  <div className="flex shrink-0 gap-1 pt-1">
                    <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="btn-secondary px-2 py-1.5" aria-label="Mover para cima">
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button type="button" onClick={() => moveStep(i, 1)} disabled={i === f.steps.length - 1} className="btn-secondary px-2 py-1.5" aria-label="Mover para baixo">
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button type="button" onClick={() => removeStep(i)} className="btn-secondary px-2 py-1.5" aria-label="Remover passo">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {f.steps.length < 30 && (
              <button type="button" onClick={() => set("steps", [...f.steps, ""])} className="btn-secondary mt-2">
                <Plus className="size-4" /> Adicionar passo
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Link para ativar (opcional)</label>
              <input className="input" type="url" value={f.activation_url} onChange={(e) => set("activation_url", e.target.value)} placeholder="https://store.steampowered.com/account/registerkey" />
            </div>
            <div>
              <label className="label">Vídeo tutorial (opcional)</label>
              <input className="input" type="url" value={f.video_url} onChange={(e) => set("video_url", e.target.value)} placeholder="Link do YouTube ou outro site" />
            </div>
          </div>

          <div>
            <label className="label">Observações (opcional)</label>
            <textarea className="input min-h-20" value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ex.: A key é de uso único. Se aparecer “região inválida”, fale com o atendimento antes de tentar de novo." />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex items-center justify-between gap-4 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
              <span>Visível na loja</span>
              <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-lg bg-surface-2 px-3 py-2.5 text-sm" title="Usado para jogos de plataformas sem tutorial próprio">
              <span>Tutorial padrão</span>
              <input type="checkbox" checked={f.is_default} onChange={(e) => set("is_default", e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
            </label>
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm">
              <span className="whitespace-nowrap">Ordem</span>
              <input className="input py-1" type="number" min={0} max={999} value={f.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button disabled={pending} className="btn-primary px-6">
              {pending && <Loader2 className="size-4 animate-spin" />} {tutorial ? "Salvar tutorial" : "Criar tutorial"}
            </button>
            {tutorial && (
              <button type="button" disabled={pending} onClick={remove} className="btn-danger">
                <Trash2 className="size-4" /> Excluir
              </button>
            )}
          </div>
        </div>

        <details open className="group h-fit rounded-xl border border-line bg-bg/40 xl:sticky xl:top-6">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
            <Eye className="size-4" /> Como o cliente vê
            <ChevronDown className="ml-auto size-4 transition group-open:rotate-180" />
          </summary>
          <div className="border-t border-line p-4">
            <ActivationTutorial tutorial={preview} />
          </div>
        </details>
      </div>
    </form>
  );
}
