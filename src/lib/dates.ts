/**
 * Normaliza datas de lançamento vindas do fornecedor para ISO (yyyy-mm-dd).
 * A API ShadowKeys retorna, na prática, "18 mar. 2021" (pt-BR abreviado) ou vazio,
 * embora o exemplo da documentação use "2022-02-25". Aceita ambos e outros formatos comuns;
 * qualquer coisa não reconhecida vira null (nunca derruba a sincronização).
 */
const MONTHS: Record<string, number> = {
  jan: 1, janeiro: 1, january: 1,
  fev: 2, fevereiro: 2, feb: 2, february: 2,
  mar: 3, marco: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  mai: 5, maio: 5, may: 5,
  jun: 6, junho: 6, june: 6,
  jul: 7, julho: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  set: 9, setembro: 9, sep: 9, sept: 9, september: 9,
  out: 10, outubro: 10, oct: 10, october: 10,
  nov: 11, novembro: 11, november: 11,
  dez: 12, dezembro: 12, dec: 12, december: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // ex.: 31 fev
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseReleaseDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/mm/aaaa
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!);

  // "18 mar. 2021", "18 de marco de 2021", "18 Mar, 2021"
  m = s.match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\.?,?\s+(?:de\s+)?(\d{4})$/);
  if (m && MONTHS[m[2]!]) return iso(+m[3]!, MONTHS[m[2]!]!, +m[1]!);

  // "Mar 18, 2021"
  m = s.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1]!]) return iso(+m[3]!, MONTHS[m[1]!]!, +m[2]!);

  return null;
}
