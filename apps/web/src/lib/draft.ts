import type { MaterialId, OrderVariant, PreviewView, PrintMethodId, PrintedZone } from '@dprinting/core';

/**
 * Brouillon de commande : uniquement des identifiants et des mesures renvoyés par le serveur.
 * Aucun prix transmis au serveur ne sera utilisé pour facturer : le devis est recalculé à la commande.
 */
export type OrderDraft = {
  productId: string;
  productName: string;
  productModel: 'tshirt';
  printMethod: PrintMethodId;
  material: MaterialId;
  previewColorId: string;
  colorName: string;
  colorHex: string;
  variants: OrderVariant[];
  zones: PrintedZone[];
  designId: string;
  previews: Record<PreviewView, { assetId: string; url: string }>;
  production: {
    zoneId: string;
    assetId: string;
    widthMm: number;
    heightMm: number;
    widthPx: number;
    heightPx: number;
    dpi: number;
  }[];
  quotedTotalCents: number;
  quotedUnitCents: number;
  createdAt: string;
};

const DRAFT_KEY = 'dprinting.draft.v1';
const ORDERS_KEY = 'dprinting.orders.v1';

export const saveDraft = (draft: OrderDraft): void => {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* stockage indisponible */ }
};

export const readDraft = (): OrderDraft | null => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderDraft;
    if (!parsed?.designId || !parsed.productId) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearDraft = (): void => {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* rien */ }
};

export type StoredOrder = { id: string; number: number; token: string; createdAt: string };

const readOrders = (): StoredOrder[] => {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(o => o && typeof o.id === 'string' && typeof o.token === 'string') : [];
  } catch {
    return [];
  }
};

/** Le jeton reste sur cet appareil : il est la seule preuve d'accès à la commande invité. */
export function rememberOrder(order: StoredOrder): void {
  try {
    const orders = readOrders().filter(o => o.id !== order.id);
    orders.unshift(order);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 40)));
  } catch { /* stockage indisponible */ }
}

export function orderToken(id: string): string | null {
  return readOrders().find(o => o.id === id)?.token ?? null;
}

export const storedOrders = (): StoredOrder[] => readOrders();
