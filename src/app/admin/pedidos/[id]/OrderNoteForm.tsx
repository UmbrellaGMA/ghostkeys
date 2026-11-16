"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { addOrderNoteAction } from "../../actions";

export function OrderNoteForm({ orderId }: { orderId: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addOrderNoteAction(orderId, note);
          toast(r.message, r.ok ? "success" : "error");
          if (r.ok) {
            setNote("");
            router.refresh();
          }
        });
      }}
      className="flex gap-2"
    >
      <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="Adicionar nota interna (ex.: reembolso registrado manualmente)" maxLength={1000} />
      <button disabled={pending || !note.trim()} className="btn-secondary">{pending ? <Loader2 className="size-4 animate-spin" /> : "Registrar"}</button>
    </form>
  );
}
