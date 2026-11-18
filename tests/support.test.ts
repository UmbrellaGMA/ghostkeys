import { describe, expect, it } from "vitest";
import { shouldEmailReply } from "@/services/SupportService";
import { pushMessages } from "@/services/push/AdminPushNotifier";
import { templates } from "@/services/email/templates";

const now = Date.parse("2026-11-18T12:00:00Z");
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

describe("chat de suporte", () => {
  it("envia e-mail da resposta quando o cliente não está com o chat aberto", () => {
    expect(shouldEmailReply({ customer_last_seen_at: iso(10), last_reply_email_at: null }, now)).toBe(true);
    expect(shouldEmailReply({ customer_last_seen_at: null, last_reply_email_at: null }, now)).toBe(true);
  });
  it("não envia e-mail se o cliente está com o chat aberto", () => {
    expect(shouldEmailReply({ customer_last_seen_at: iso(0.5), last_reply_email_at: null }, now)).toBe(false);
  });
  it("no máximo um e-mail a cada 15 minutos por conversa", () => {
    expect(shouldEmailReply({ customer_last_seen_at: iso(30), last_reply_email_at: iso(5) }, now)).toBe(false);
    expect(shouldEmailReply({ customer_last_seen_at: iso(30), last_reply_email_at: iso(20) }, now)).toBe(true);
  });
  it("push do suporte abre a conversa no painel e resume a mensagem", () => {
    const m = pushMessages.supportMessage({ id: "c1", customer_name: "Ana Paula" }, "Oi,\n\n  minha key   não ativa" + " x".repeat(200));
    expect(m.url).toBe("/admin/suporte/c1");
    expect(m.title).toContain("Ana Paula");
    expect(m.body.startsWith("Oi, minha key não ativa")).toBe(true);
    expect(m.body.length).toBeLessThanOrEqual(160);
    expect(m.tag).toBe("support-c1");
  });
  it("e-mail de resposta escapa HTML e leva ao chat", () => {
    const e = templates.supportReply({ storeName: "GhostKeys", appUrl: "https://ghostkeys.online" }, "<b>Ana</b>", "<script>alert(1)</script>");
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("<b>Ana</b>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("https://ghostkeys.online/suporte");
  });
});
