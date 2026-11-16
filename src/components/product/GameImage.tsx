import Image from "next/image";
import { Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIMIZED_HOSTS = [
  "cdn.cloudflare.steamstatic.com",
  "shared.cloudflare.steamstatic.com",
  "cdn.akamai.steamstatic.com",
  "shared.akamai.steamstatic.com",
  "steamcdn-a.akamaihd.net",
];

function canOptimize(src: string) {
  try {
    const host = new URL(src).hostname;
    return OPTIMIZED_HOSTS.includes(host) || host.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

/** Imagem de jogo otimizada (next/image) com fallback visual quando não há imagem. */
export function GameImage({
  src,
  alt,
  className,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  priority,
}: {
  src: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (!src) {
    return (
      <div className={cn("grid place-items-center bg-gradient-to-br from-surface-3 to-surface", className)}>
        <Gamepad2 className="size-8 text-subtle" />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={!canOptimize(src)}
      className={cn("object-cover", className)}
    />
  );
}
