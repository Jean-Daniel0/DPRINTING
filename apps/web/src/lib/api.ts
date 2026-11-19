import type {
  CheckoutPayload, DesignDocument, DesignRecord, OrderRecord, OrderStatus, PreviewView, ProductDef,
  QuotePayload, QuoteResponse, UploadedAsset,
} from '@dprinting/core';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit & { admin?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  if (init.admin) headers.set('x-dprinting-csrf', '1');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err = body as { error?: { code?: string; message?: string; details?: unknown } } | null;
    throw new ApiError(res.status, err?.error?.code ?? 'HTTP_ERROR', err?.error?.message ?? `Erreur ${res.status}.`, err?.error?.details);
  }
  return body as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

type AdminOrderSummary = {
  id: string; number: number; status: OrderStatus; email: string;
  customer: OrderRecord['customer']; totals: { subtotalCents: number; discountCents: number; totalCents: number };
  createdAt: string; quantity: number; products: string;
};
export type AdminOrderDetail = OrderRecord & { productionUrls: Record<string, string> };

export const api = {
  health: () => request<{ ok: boolean; db: string; storage: string }>('/api/health'),
  catalog: () => request<{ products: ProductDef[] }>('/api/catalog'),
  product: (id: string) => request<{ product: ProductDef }>(`/api/products/${encodeURIComponent(id)}`),
  quote: (payload: QuotePayload) => request<QuoteResponse>('/api/quotes', json(payload)),
  saveDesign: (productId: string, document: DesignDocument) =>
    request<DesignRecord>('/api/designs', json({ productId, document })),
  design: (id: string) => request<DesignRecord>(`/api/designs/${encodeURIComponent(id)}`),
  placeOrder: (payload: CheckoutPayload) => request<{ order: OrderRecord; accessToken: string }>('/api/orders', json(payload)),
  order: (id: string, access: string) => request<{ order: OrderRecord }>(`/api/orders/${encodeURIComponent(id)}?access=${encodeURIComponent(access)}`),

  uploadAsset: async (input: {
    kind: 'source' | 'preview' | 'production';
    file: Blob;
    filename?: string;
    view?: PreviewView;
    zoneId?: string;
    widthMm?: number;
    heightMm?: number;
    dpi?: number;
    designId?: string;
  }): Promise<UploadedAsset> => {
    const fd = new FormData();
    fd.append('kind', input.kind);
    if (input.view) fd.append('view', input.view);
    if (input.zoneId) fd.append('zoneId', input.zoneId);
    if (input.widthMm !== undefined) fd.append('widthMm', String(input.widthMm));
    if (input.heightMm !== undefined) fd.append('heightMm', String(input.heightMm));
    if (input.dpi !== undefined) fd.append('dpi', String(input.dpi));
    if (input.designId) fd.append('designId', input.designId);
    fd.append('file', input.file, input.filename ?? 'fichier.png');
    return request<UploadedAsset>(`/api/assets?kind=${input.kind}`, { method: 'POST', body: fd });
  },

  admin: {
    login: (email: string, password: string) => request<{ email: string }>('/api/admin/login', json({ email, password })),
    logout: () => request<{ ok: true }>('/api/admin/logout', { method: 'POST' }),
    session: () => request<{ email: string }>('/api/admin/session'),
    products: () => request<{ products: ProductDef[] }>('/api/admin/products'),
    createProduct: (product: ProductDef) => request<{ product: ProductDef }>('/api/admin/products', { ...json(product), admin: true }),
    updateProduct: (product: ProductDef) => request<{ product: ProductDef }>(`/api/admin/products/${encodeURIComponent(product.id)}`, { ...json(product), method: 'PUT', admin: true }),
    disableProduct: (id: string) => request<{ ok: true }>(`/api/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE', admin: true }),
    orders: (limit = 100) => request<{ orders: AdminOrderSummary[] }>(`/api/admin/orders?limit=${limit}`),
    order: (id: string) => request<{ order: AdminOrderDetail }>(`/api/admin/orders/${encodeURIComponent(id)}`),
    setStatus: (id: string, status: OrderStatus) =>
      request<{ ok: true }>(`/api/admin/orders/${encodeURIComponent(id)}`, { ...json({ status }), method: 'PATCH', admin: true }),
    stats: () => request<{ orders: number; pending: number; revenueCents: number }>('/api/admin/stats'),
  },
};

export type { AdminOrderSummary };
