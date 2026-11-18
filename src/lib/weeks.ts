/**
 * Semanas de segunda a domingo no horário de Brasília (UTC−3, sem horário de verão desde 2019).
 * Uma semana é identificada pela data da segunda-feira: "2026-11-16".
 */

const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Segunda-feira (AAAA-MM-DD) da semana que contém `date`, no horário de Brasília. */
export function weekStartOf(date: Date | string = new Date()): string {
  const local = new Date(new Date(date).getTime() - OFFSET_MS); // "relógio" de Brasília em UTC
  const dow = (local.getUTCDay() + 6) % 7; // 0 = segunda
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
}

/** Valida e normaliza o parâmetro ?semana= (qualquer dia vira a segunda da semana). */
export function parseWeek(value: string | null | undefined): string {
  if (value && WEEK_RE.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))) return weekStartOf(`${value}T12:00:00-03:00`);
  return weekStartOf();
}

/** Início (segunda 00:00) e fim exclusivo (segunda seguinte 00:00) em ISO/UTC. */
export function weekRange(weekStart: string): { from: string; to: string } {
  const from = new Date(`${weekStart}T00:00:00-03:00`);
  return { from: from.toISOString(), to: new Date(from.getTime() + 7 * DAY_MS).toISOString() };
}

export function shiftWeek(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** "16/11 a 22/11/2026" */
export function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number) as [number, number, number];
  const end = new Date(Date.UTC(y, m - 1, d + 6));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}/${pad(m)} a ${pad(end.getUTCDate())}/${pad(end.getUTCMonth() + 1)}/${end.getUTCFullYear()}`;
}

/** Comissão em centavos (arredondada ao centavo). */
export function commissionCents(totalCents: number, percent: number | string | null | undefined): number {
  const p = Number(percent ?? 0);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.round((totalCents * p) / 100);
}
