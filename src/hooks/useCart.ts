"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Carrinho persistido no navegador (localStorage).
 * Guarda apenas ID, quantidade e dados de exibição. O preço exibido é sempre
 * revalidado no servidor (/api/cart/validate) e recalculado ao criar o pedido.
 */

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  priceCents: number; // apenas para exibição rápida; nunca usado no pedido
  quantity: number;
}

const KEY = "ghostkeys:cart:v1";
const EVENT = "ghostkeys:cart";
const EMPTY: CartItem[] = [];
let cache: { raw: string | null; items: CartItem[] } = { raw: null, items: EMPTY };

function read(): CartItem[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.items;
  }
  if (raw === cache.raw) return cache.items;
  let items: CartItem[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      items = parsed.filter((i) => i && typeof i.productId === "string" && Number.isInteger(i.quantity) && i.quantity > 0);
    }
  } catch {
    items = EMPTY;
  }
  cache = { raw, items };
  return items;
}

function write(items: CartItem[]) {
  const raw = JSON.stringify(items);
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    /* armazenamento indisponível: mantém em memória */
  }
  cache = { raw, items };
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useCart(maxQuantity = 5) {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);

  const add = useCallback(
    (item: Omit<CartItem, "quantity">, quantity = 1) => {
      const current = read();
      const existing = current.find((i) => i.productId === item.productId);
      const next = existing
        ? current.map((i) => (i.productId === item.productId ? { ...i, ...item, quantity: Math.min(maxQuantity, i.quantity + quantity) } : i))
        : [...current, { ...item, quantity: Math.min(maxQuantity, quantity) }];
      write(next);
    },
    [maxQuantity],
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      const q = Math.max(1, Math.min(maxQuantity, Math.floor(quantity)));
      write(read().map((i) => (i.productId === productId ? { ...i, quantity: q } : i)));
    },
    [maxQuantity],
  );

  const remove = useCallback((productId: string) => write(read().filter((i) => i.productId !== productId)), []);
  const clear = useCallback(() => write([]), []);
  const sync = useCallback((updater: (items: CartItem[]) => CartItem[]) => write(updater(read())), []);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  return { items, count, add, setQuantity, remove, clear, sync };
}
