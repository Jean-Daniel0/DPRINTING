// Contrats partagés entre l'interface et le serveur.
// Le client ne transmet jamais de prix : il envoie une configuration, le serveur recalcule.
import type { DesignDocument } from './document';
import type { MaterialId, PrintMethodId, ProductDef } from './catalog';
import type { QuoteResult } from './pricing';

export const PREVIEW_VIEWS = ['face', 'back', 'left', 'right'] as const;
export type PreviewView = (typeof PREVIEW_VIEWS)[number];
export const PREVIEW_LABELS: Record<PreviewView, string> = {
  face: 'Face',
  back: 'Dos',
  left: 'Profil gauche',
  right: 'Profil droit',
};

export type ApiError = { error: { code: string; message: string; details?: unknown } };
export type ProductSummary = Pick<ProductDef, 'id' | 'name' | 'category' | 'description' | 'model' | 'colors' | 'sizes' | 'pricing'>;

export type QuotePayload = {
  productId: string;
  printMethod: PrintMethodId;
  material: MaterialId;
  variants: { colorId: string; sizeId: string | null; quantity: number }[];
  zones: { zoneId: string; widthMm: number; heightMm: number }[];
};

export type QuoteResponse = QuoteResult & {
  productId: string;
  printMethod: PrintMethodId;
  material: MaterialId;
  zones: { zoneId: string; widthMm: number; heightMm: number }[];
  /** Prix unitaire TTC de chaque variante, arrondi, pour l'affichage du panier. */
  display: { unitLabel: string; totalLabel: string };
};

export type DesignRecord = {
  id: string;
  productId: string;
  document: DesignDocument;
  createdAt: string;
  /** URLs signées, valables quelques heures, vers les images sources utilisées par le design. */
  assetUrls: Record<string, string>;
};

export type UploadedAsset = {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
};

export type OrderVariant = { colorId: string; sizeId: string | null; quantity: number };

export type OrderItemPayload = {
  productId: string;
  printMethod: PrintMethodId;
  material: MaterialId;
  designId: string;
  variants: OrderVariant[];
  /** Couleur utilisée pour les aperçus 3D (les fichiers de production, eux, sont indépendants de la couleur). */
  previewColorId: string;
  /** Quatre aperçus commerciaux, un par vue fixe. Aucune autre vue n'est acceptée. */
  previews: Record<PreviewView, string>;
  /** Un PNG de production par zone réellement imprimée (dimensions et DPI vérifiés par le serveur). */
  productionAssets: { zoneId: string; assetId: string }[];
};

export type CustomerInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  postalCode: string;
  city: string;
  country: string;
  notes?: string;
};

export type CheckoutPayload = {
  customer: CustomerInfo;
  items: OrderItemPayload[];
};

export type OrderZoneSnapshot = {
  zoneId: string;
  label: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  productionAssetId: string;
};

export type OrderPreviewSnapshot = { view: PreviewView; assetId: string; url: string };

export type OrderItemSnapshot = {
  id: string;
  productId: string;
  productName: string;
  model: ProductDef['model'];
  printMethod: PrintMethodId;
  material: MaterialId;
  previewColorId: string;
  variants: (OrderVariant & { unitPriceCents: number; lineTotalCents: number })[];
  quantity: number;
  designId: string;
  designDocument: DesignDocument;
  zones: OrderZoneSnapshot[];
  previews: OrderPreviewSnapshot[];
  unitPriceCents: number;
  totalCents: number;
  pricing: QuoteResult;
};

export type OrderStatus = 'pending' | 'confirmed' | 'in_production' | 'shipped' | 'cancelled';
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  in_production: 'En production',
  shipped: 'Expédiée',
  cancelled: 'Annulée',
};

export type OrderRecord = {
  id: string;
  number: number;
  status: OrderStatus;
  customer: CustomerInfo;
  items: OrderItemSnapshot[];
  currency: 'EUR';
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  /** Jeton d'accès invité, renvoyé une seule fois à la création. */
  accessToken?: string;
};

export type OrderCreated = { order: OrderRecord; accessToken: string };

export type AdminProductInput = Omit<ProductDef, 'pricing'> & { pricing: ProductDef['pricing'] };
