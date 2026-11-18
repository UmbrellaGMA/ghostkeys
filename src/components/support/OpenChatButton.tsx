"use client";
import { MessageCircle } from "lucide-react";
import { openSupportChat } from "./SupportWidget";

/** Botão que abre o chat de suporte (opcionalmente com um texto inicial, ex.: número do pedido). */
export function OpenChatButton({ text, label = "Abrir chat de suporte", className = "btn-primary" }: { text?: string; label?: string; className?: string }) {
  return (
    <button type="button" onClick={() => openSupportChat(text)} className={className}>
      <MessageCircle className="size-4" /> {label}
    </button>
  );
}
