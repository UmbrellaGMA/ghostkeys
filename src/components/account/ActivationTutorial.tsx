import { ExternalLink, Info, PlayCircle } from "lucide-react";
import type { ActivationTutorial as Tutorial } from "@/types";
import { youtubeEmbedUrl } from "@/lib/tutorials";
import { cn } from "@/lib/utils";

/** Exibe um tutorial de ativação. Sem hooks: funciona em componentes de servidor e de cliente. */
export function ActivationTutorial({ tutorial, compact = false, className }: { tutorial: Tutorial; compact?: boolean; className?: string }) {
  const embed = youtubeEmbedUrl(tutorial.video_url);
  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h3 className="font-display text-base font-bold text-white">{tutorial.title}</h3>
        {tutorial.intro && <p className="mt-1 whitespace-pre-line text-sm text-muted">{tutorial.intro}</p>}
      </div>

      {tutorial.steps.length > 0 && (
        <ol className="space-y-2.5">
          {tutorial.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-fg">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-bold text-accent-2">{i + 1}</span>
              <span className="pt-0.5 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      )}

      {(tutorial.activation_url || (tutorial.video_url && !embed)) && (
        <div className="flex flex-wrap gap-2">
          {tutorial.activation_url && (
            <a href={tutorial.activation_url} target="_blank" rel="noopener noreferrer" className="btn-primary">
              <ExternalLink className="size-4" /> Ativar na {tutorial.platform}
            </a>
          )}
          {tutorial.video_url && !embed && (
            <a href={tutorial.video_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <PlayCircle className="size-4" /> Ver vídeo tutorial
            </a>
          )}
        </div>
      )}

      {embed && !compact && (
        <div className="aspect-video overflow-hidden rounded-xl border border-line bg-black">
          <iframe
            src={embed}
            title={`Vídeo: ${tutorial.title}`}
            className="size-full"
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {embed && compact && (
        <a href={tutorial.video_url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <PlayCircle className="size-4" /> Ver vídeo tutorial
        </a>
      )}

      {tutorial.notes && (
        <p className="flex gap-2 rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-accent-2" />
          <span className="whitespace-pre-line">{tutorial.notes}</span>
        </p>
      )}
    </div>
  );
}
