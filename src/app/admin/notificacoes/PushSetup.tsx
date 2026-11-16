"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCircle2, Loader2, PlusSquare, Send, Share, Smartphone, Trash2, TriangleAlert } from "lucide-react";
import { PUSH_EVENTS, PUSH_EVENT_KEYS, type PushEventKey } from "@/lib/push-events";
import { formatDateTime } from "@/lib/utils";
import { toast } from "@/components/ui/Toaster";
import { removePushAction, subscribePushAction, testPushAction, updatePushEventsAction } from "../actions";

export interface PushDevice {
  id: string;
  endpoint: string;
  device_label: string | null;
  events: string[];
  created_at: string;
  last_sent_at: string | null;
}

type Env = "loading" | "ios-browser" | "unsupported" | "ready";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh/.test(ua)) return "Mac";
  return "Navegador";
}

export function PushSetup({ devices, vapidPublicKey, serverReady }: { devices: PushDevice[]; vapidPublicKey: string; serverReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [env, setEnv] = useState<Env>("loading");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [endpoint, setEndpoint] = useState<string | null>(null);

  const current = devices.find((d) => d.endpoint === endpoint) ?? null;
  const [events, setEvents] = useState<string[]>(PUSH_EVENT_KEYS);
  useEffect(() => {
    if (current) setEvents(current.events);
  }, [current]);

  const detect = useCallback(async () => {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (isIOS && !standalone) return setEnv("ios-browser");
    if (!supported) return setEnv("unsupported");
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const sub = await reg.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
    } catch (e) {
      console.error(e);
    }
    setEnv("ready");
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  const enable = () =>
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") {
          toast("Permissão negada. Libere as notificações nos Ajustes do aparelho.", "error");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
        }
        const json = sub.toJSON();
        const r = await subscribePushAction({ endpoint: json.endpoint, keys: json.keys, label: deviceLabel() });
        toast(r.message, r.ok ? "success" : "error");
        if (r.ok) {
          setEndpoint(sub.endpoint);
          router.refresh();
        }
      } catch (e) {
        console.error(e);
        toast("Não foi possível ativar neste aparelho. Tente novamente.", "error");
      }
    });

  const disable = () =>
    start(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        const ep = sub?.endpoint ?? endpoint;
        await sub?.unsubscribe();
        if (ep) await removePushAction({ endpoint: ep });
        setEndpoint(null);
        toast("Notificações desativadas neste aparelho");
        router.refresh();
      } catch {
        toast("Não foi possível desativar", "error");
      }
    });

  const toggleEvent = (key: PushEventKey) => {
    if (!endpoint) return;
    const next = events.includes(key) ? events.filter((e) => e !== key) : [...events, key];
    setEvents(next);
    start(async () => {
      const r = await updatePushEventsAction(endpoint, next);
      if (!r.ok) {
        toast(r.message, "error");
        setEvents(events);
      }
    });
  };

  const test = (ep?: string) =>
    start(async () => {
      const r = await testPushAction(ep);
      toast(r.message, r.ok ? "success" : "error");
    });

  const removeDevice = (d: PushDevice) =>
    start(async () => {
      if (!confirm(`Remover "${d.device_label ?? "aparelho"}"? Ele deixará de receber notificações.`)) return;
      const r = await removePushAction({ id: d.id });
      toast(r.message, r.ok ? "success" : "error");
      if (d.endpoint === endpoint) setEndpoint(null);
      router.refresh();
    });

  const active = env === "ready" && permission === "granted" && Boolean(current);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {!serverReady && (
          <div className="card flex gap-3 border-danger/40 p-5 text-sm text-red-200">
            <TriangleAlert className="size-5 shrink-0 text-danger" />
            Servidor sem as chaves VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY. Configure-as na Vercel para ativar as notificações.
          </div>
        )}

        <section className="card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-white">
            <Smartphone className="size-5 text-accent" /> Este aparelho
          </h2>

          {env === "loading" && <div className="skeleton h-24" />}

          {env === "ios-browser" && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                No iPhone, as notificações só funcionam com o painel instalado como app (iOS 16.4 ou mais recente). Leva 30 segundos:
              </p>
              <ol className="space-y-3 text-sm text-fg">
                <li className="flex gap-3">
                  <Step n={1} />
                  <span>
                    Abra <strong>ghostkeys.online/admin</strong> no <strong>Safari</strong> e toque em <Share className="inline size-4 align-text-bottom text-accent-2" />{" "}
                    <strong>Compartilhar</strong>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Step n={2} />
                  <span>
                    Toque em <PlusSquare className="inline size-4 align-text-bottom text-accent-2" /> <strong>Adicionar à Tela de Início</strong> e depois em{" "}
                    <strong>Adicionar</strong>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Step n={3} />
                  <span>
                    Abra o app <strong>GK Admin</strong> pela tela de início, entre com sua conta e volte aqui em <strong>Notificações</strong>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Step n={4} />
                  <span>
                    Toque em <strong>Ativar notificações</strong> e em <strong>Permitir</strong>.
                  </span>
                </li>
              </ol>
            </div>
          )}

          {env === "unsupported" && (
            <p className="text-sm text-muted">Este navegador não suporta notificações push. No iPhone, use o app instalado pela tela de início (Safari › Compartilhar › Adicionar à Tela de Início).</p>
          )}

          {env === "ready" && (
            <div className="space-y-4">
              {active ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="size-4" /> Notificações ativas neste aparelho.
                </p>
              ) : permission === "denied" ? (
                <p className="text-sm text-warning">
                  As notificações foram bloqueadas. No iPhone: Ajustes › Notificações › GK Admin › Permitir Notificações. Depois volte aqui.
                </p>
              ) : (
                <p className="text-sm text-muted">Ative para receber os avisos da loja neste aparelho, mesmo com o app fechado.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {active ? (
                  <>
                    <button onClick={() => test(endpoint ?? undefined)} disabled={pending} className="btn-primary">
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar teste
                    </button>
                    <button onClick={disable} disabled={pending} className="btn-secondary">
                      <BellOff className="size-4" /> Desativar
                    </button>
                  </>
                ) : (
                  <button onClick={enable} disabled={pending || !serverReady || permission === "denied"} className="btn-primary px-6 py-3">
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />} Ativar notificações
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {active && (
          <section className="card p-6">
            <h2 className="mb-1 font-display text-lg font-bold text-white">O que avisar neste aparelho</h2>
            <p className="mb-4 text-sm text-muted">Toque no aviso para abrir o pedido direto no painel.</p>
            <ul className="space-y-2">
              {PUSH_EVENTS.map((e) => (
                <li key={e.key}>
                  <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-surface-2 px-4 py-3">
                    <span>
                      <span className="block text-sm font-semibold text-fg">{e.label}</span>
                      <span className="block text-xs text-muted">{e.hint}</span>
                    </span>
                    <input type="checkbox" checked={events.includes(e.key)} onChange={() => toggleEvent(e.key)} className="size-5 shrink-0 accent-[var(--color-accent)]" />
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="card h-fit p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-white">Aparelhos inscritos</h2>
        {!devices.length ? (
          <p className="text-sm text-muted">Nenhum aparelho ainda.</p>
        ) : (
          <ul className="space-y-3">
            {devices.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 rounded-lg bg-surface-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">
                    {d.device_label ?? "Aparelho"} {d.endpoint === endpoint && <span className="text-xs font-normal text-success">(este)</span>}
                  </p>
                  <p className="text-xs text-muted">Desde {formatDateTime(d.created_at)}</p>
                  <p className="text-xs text-muted">{d.last_sent_at ? `Último aviso ${formatDateTime(d.last_sent_at)}` : "Nenhum aviso enviado"}</p>
                  <p className="text-xs text-subtle">{d.events.length} de {PUSH_EVENTS.length} eventos</p>
                </div>
                <button onClick={() => removeDevice(d)} disabled={pending} className="btn-secondary shrink-0 px-2 py-1.5" aria-label="Remover aparelho">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {devices.length > 0 && (
          <button onClick={() => test()} disabled={pending} className="btn-secondary mt-4 w-full">
            <Send className="size-4" /> Testar em todos
          </button>
        )}
      </aside>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-bold text-accent-2">{n}</span>;
}
