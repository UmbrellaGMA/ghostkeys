import "server-only";
import { timingSafeEqual } from "node:crypto";
import { optionalEnv } from "@/lib/env";

/** Autoriza chamadas do agendador (Vercel Cron envia "Authorization: Bearer <CRON_SECRET>"). */
export function isCronAuthorized(req: Request): boolean {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
