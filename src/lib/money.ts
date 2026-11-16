const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 2600 => "R$ 26,00" */
export function formatBRL(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  return brl.format(cents / 100);
}

/** 2600 => 26 (número para APIs que recebem reais, como o Mercado Pago) */
export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

/** 26.0 => 2600 — arredonda para evitar 25.999999 */
export function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

/** "26,90" ou "26.90" => 2690. Retorna null para entradas inválidas. */
export function parseBRLInput(input: string): number | null {
  const normalized = input.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return reaisToCents(Number(normalized));
}

export function discountPercent(originalCents: number | null | undefined, finalCents: number): number {
  if (!originalCents || originalCents <= finalCents) return 0;
  return Math.round(((originalCents - finalCents) / originalCents) * 100);
}
