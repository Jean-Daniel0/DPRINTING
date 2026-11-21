import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Boxes, Check, ClipboardList, Download, ExternalLink, FileImage, Loader2, LogOut,
  Package, RefreshCw, Save, ShieldCheck, ShoppingBag, Euro, X,
} from 'lucide-react';
import {
  ORDER_STATUS_LABELS, PRINT_METHODS, PREVIEW_LABELS, PREVIEW_VIEWS, formatMoney,
  type OrderStatus, type ProductDef,
} from '@dprinting/core';
import { api, type AdminOrderDetail, type AdminOrderSummary } from '../lib/api';
import { useTitle } from '../lib/useTitle';
import { Container } from '../components/Layout';
import { Badge, Button, Field, Input, Modal, Notice, Spinner, Textarea, cn } from '../components/ui';

const STATUSES: OrderStatus[] = ['pending', 'confirmed', 'in_production', 'shipped', 'cancelled'];
const STATUS_TONE: Record<OrderStatus, 'neutral' | 'gold' | 'mint' | 'danger' | 'cobalt'> = {
  pending: 'gold', confirmed: 'cobalt', in_production: 'cobalt', shipped: 'mint', cancelled: 'danger',
};

function formatDate(value: string): string {
  try { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
}

function Login({ onDone }: { onDone: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.login(email, password);
      onDone(res.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-md rounded-3xl border border-ink-200 bg-white p-6 shadow-soft sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-950 text-gold"><ShieldCheck size={22} /></span>
        <h1 className="mt-4 font-display text-2xl uppercase tracking-tight">Administration</h1>
        <p className="mt-1 text-sm text-ink-500">Accès réservé à l’atelier. Session signée, cookie HttpOnly.</p>
        <form className="mt-5 space-y-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <Field label="E-mail" htmlFor="admin-email">
            <Input id="admin-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
          </Field>
          <Field label="Mot de passe" htmlFor="admin-password">
            <Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button block type="submit" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : null} Se connecter</Button>
        </form>
        <p className="mt-4 text-[10px] leading-relaxed text-ink-400">
          En développement : admin@dprinting.local / dprinting-dev. En production, le mot de passe est défini par ADMIN_PASSWORD_HASH.
        </p>
      </div>
    </Container>
  );
}

function OrderDetail({ id, onClose, onStatus }: { id: string; onClose: () => void; onStatus: (status: OrderStatus) => Promise<void> }) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.admin.order(id)
      .then(res => { if (alive) setOrder(res.order); })
      .catch((err: Error) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [id]);

  const change = async (status: OrderStatus) => {
    setBusy(true);
    try {
      await onStatus(status);
      setOrder(current => current ? { ...current, status } : current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={order ? `Commande n° ${order.number}` : 'Commande'} wide>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!order && !error ? <Spinner label="Chargement de la commande…" /> : null}
      {order ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-paper-deep/50 p-3">
            <div className="text-xs text-ink-500">
              <p className="font-semibold text-ink-900">{order.customer.firstName} {order.customer.lastName} · {order.customer.email}</p>
              <p>{order.customer.phone} · {formatDate(order.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={order.status}
                disabled={busy}
                onChange={e => void change(e.target.value as OrderStatus)}
                className="min-h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-semibold"
                aria-label="Statut de la commande"
              >
                {STATUSES.map(status => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}
              </select>
              <Badge tone={STATUS_TONE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink-200 p-3 text-xs leading-relaxed text-ink-600">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">Adresse de livraison</p>
              <p className="font-semibold text-ink-900">{order.customer.firstName} {order.customer.lastName}</p>
              <p>{order.customer.addressLine1}</p>
              {order.customer.addressLine2 ? <p>{order.customer.addressLine2}</p> : null}
              <p>{order.customer.postalCode} {order.customer.city}, {order.customer.country}</p>
              {order.customer.notes ? <p className="mt-2 rounded-lg bg-paper-deep p-2 text-[11px]">{order.customer.notes}</p> : null}
            </div>
            <div className="rounded-2xl border border-ink-200 p-3 text-xs leading-relaxed text-ink-600">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">Totaux</p>
              <p className="flex justify-between"><span>Sous-total</span><span>{formatMoney(order.subtotalCents)}</span></p>
              <p className="flex justify-between"><span>Remise</span><span>{formatMoney(-order.discountCents)}</span></p>
              <p className="flex justify-between"><span>Livraison</span><span>{formatMoney(order.shippingCents)}</span></p>
              <p className="mt-1 flex justify-between border-t border-ink-200 pt-1 font-display text-base text-ink-950"><span>Total</span><span>{formatMoney(order.totalCents)}</span></p>
            </div>
          </div>

          {order.items.map(item => (
            <div key={item.id} className="rounded-2xl border border-ink-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{item.productName} · {item.quantity} pièce{item.quantity > 1 ? 's' : ''}</p>
                <p className="text-xs text-ink-500">{PRINT_METHODS[item.printMethod].name} · {formatMoney(item.totalCents)}</p>
              </div>
              <p className="mt-1 text-[11px] text-ink-500">
                {item.variants.map(v => `${v.sizeId ?? 'unique'} × ${v.quantity}`).join(' · ')} · design <span className="font-mono">{item.designId.slice(0, 8)}…</span>
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {PREVIEW_VIEWS.map(view => {
                  const preview = item.previews.find(p => p.view === view);
                  return (
                    <figure key={view} className="overflow-hidden rounded-lg border border-ink-200">
                      {preview?.url ? <a href={preview.url} target="_blank" rel="noreferrer"><img src={preview.url} alt={`${PREVIEW_LABELS[view]}`} className="aspect-[4/5] w-full object-cover" loading="lazy" /></a> : <div className="grid aspect-[4/5] place-items-center text-[10px] text-ink-400">—</div>}
                      <figcaption className="bg-paper-deep px-1 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-ink-500">{PREVIEW_LABELS[view]}</figcaption>
                    </figure>
                  );
                })}
              </div>
              <div className="mt-3 space-y-1.5">
                {item.zones.map(zone => {
                  const url = order.productionUrls[zone.productionAssetId];
                  return (
                    <div key={zone.zoneId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-paper-deep/50 px-2.5 py-1.5 text-[11px]">
                      <span className="flex items-center gap-1.5 font-semibold"><FileImage size={13} className="text-ink-400" /> {zone.label}</span>
                      <span className="tabular-nums text-ink-500">{zone.widthMm} × {zone.heightMm} mm · {zone.dpi} DPI</span>
                      {url ? <a href={url} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 font-semibold text-ink-700 hover:border-ink-950"><Download size={12} /> PNG</a> : <span className="text-danger">URL indisponible</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}

function ProductEditor({ product, onClose, onSaved }: { product: ProductDef; onClose: () => void; onSaved: (product: ProductDef) => void }) {
  const [draft, setDraft] = useState({
    name: product.name,
    description: product.description,
    basePriceCents: product.pricing.basePriceCents,
    active: product.active,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.admin.updateProduct({
        ...product,
        name: draft.name.trim(),
        description: draft.description.trim(),
        active: draft.active,
        pricing: { ...product.pricing, basePriceCents: Math.max(0, Math.round(draft.basePriceCents)) },
      });
      onSaved(res.product);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Modifier ${product.name}`}>
      <div className="space-y-3">
        <Field label="Nom" htmlFor="p-name"><Input id="p-name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Description" htmlFor="p-desc"><Textarea id="p-desc" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></Field>
        <Field label="Prix de base (centimes)" htmlFor="p-price" hint={formatMoney(Math.round(draft.basePriceCents))}>
          <Input id="p-price" type="number" min={0} step={10} value={draft.basePriceCents} onChange={e => setDraft({ ...draft, basePriceCents: Number(e.target.value) || 0 })} />
        </Field>
        <label className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm">
          <input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Produit actif et visible au catalogue
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}

export function Admin() {
  useTitle('Administration');
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<'orders' | 'products'>('orders');
  const [stats, setStats] = useState<{ orders: number; pending: number; revenueCents: number } | null>(null);
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [products, setProducts] = useState<ProductDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductDef | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStats, nextOrders, nextProducts] = await Promise.all([
        api.admin.stats(), api.admin.orders(200), api.admin.products(),
      ]);
      setStats(nextStats);
      setOrders(nextOrders.orders);
      setProducts(nextProducts.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api.admin.session()
      .then(res => { if (alive) setEmail(res.email); })
      .catch(() => { if (alive) setEmail(null); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (email) void refresh(); }, [email, refresh]);

  const filtered = useMemo(
    () => statusFilter === 'all' ? orders : orders.filter(order => order.status === statusFilter),
    [orders, statusFilter],
  );

  if (checking) return <Container className="py-24"><Spinner label="Vérification de la session…" /></Container>;
  if (!email) return <Login onDone={setEmail} />;

  const setStatus = async (id: string, status: OrderStatus) => {
    await api.admin.setStatus(id, status);
    setOrders(current => current.map(order => order.id === id ? { ...order, status } : order));
    if (stats) {
      const pending = orders.filter(order => order.id === id ? status === 'pending' : order.status === 'pending').length;
      setStats({ ...stats, pending });
    }
  };

  const toggleProduct = async (product: ProductDef) => {
    try {
      const res = await api.admin.updateProduct({ ...product, active: !product.active });
      setProducts(current => current.map(p => p.id === product.id ? res.product : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
    }
  };

  const logout = async () => {
    try { await api.admin.logout(); } catch { /* session déjà fermée */ }
    setEmail(null);
    setOrders([]);
    setProducts([]);
    setStats(null);
  };

  return (
    <Container className="py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cobalt">Atelier</p>
          <h1 className="mt-1 font-display text-3xl uppercase leading-none tracking-tight sm:text-4xl">Administration</h1>
          <p className="mt-2 text-sm text-ink-500">Connecté en tant que {email}. Les mutations exigent l’en-tête CSRF et une session signée.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser</Button>
          <Button variant="ghost" size="sm" onClick={() => void logout()}><LogOut size={14} /> Déconnexion</Button>
        </div>
      </div>

      {error ? <div className="mb-4"><Notice tone="danger" title="Erreur">{error}</Notice></div> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400"><ShoppingBag size={12} /> Commandes</p>
          <p className="mt-1 font-display text-3xl">{stats?.orders ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400"><ClipboardList size={12} /> En attente</p>
          <p className="mt-1 font-display text-3xl">{stats?.pending ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400"><Euro size={12} /> Volume enregistré</p>
          <p className="mt-1 font-display text-3xl">{stats ? formatMoney(stats.revenueCents) : '—'}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1 rounded-2xl border border-ink-200 bg-ink-100/60 p-1">
        <button type="button" onClick={() => setTab('orders')} className={cn('min-h-9 flex-1 rounded-xl px-3 text-xs font-semibold', tab === 'orders' ? 'bg-white text-ink-950 shadow-soft' : 'text-ink-500')}>Commandes</button>
        <button type="button" onClick={() => setTab('products')} className={cn('min-h-9 flex-1 rounded-xl px-3 text-xs font-semibold', tab === 'products' ? 'bg-white text-ink-950 shadow-soft' : 'text-ink-500')}>Produits</button>
      </div>

      {tab === 'orders' ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Filtrer</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as OrderStatus | 'all')} className="min-h-9 rounded-lg border border-ink-200 bg-white px-2 text-xs font-semibold" aria-label="Filtrer par statut">
              <option value="all">Tous les statuts</option>
              {STATUSES.map(status => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}
            </select>
            <span className="text-[11px] text-ink-400">{filtered.length} commande{filtered.length > 1 ? 's' : ''}</span>
          </div>

          {!filtered.length ? (
            <div className="rounded-3xl border border-dashed border-ink-300 bg-white/50 px-6 py-14 text-center">
              <Package size={24} className="mx-auto text-ink-300" />
              <p className="mt-2 font-display text-lg uppercase tracking-tight">Aucune commande</p>
              <p className="mt-1 text-sm text-ink-500">Les commandes passées depuis le studio apparaîtront ici.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
              <div className="hidden grid-cols-[70px_minmax(0,1fr)_110px_110px_150px_40px] gap-3 border-b border-ink-200 bg-paper-deep/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-400 md:grid">
                <span>N°</span><span>Client</span><span>Articles</span><span>Total</span><span>Statut</span><span />
              </div>
              <ul>
                {filtered.map(order => (
                  <li key={order.id} className="border-b border-ink-100 last:border-0">
                    <div className="grid gap-2 px-3 py-3 md:grid-cols-[70px_minmax(0,1fr)_110px_110px_150px_40px] md:items-center md:gap-3">
                      <button type="button" onClick={() => setSelectedOrder(order.id)} className="text-left font-display text-sm hover:text-cobalt">#{order.number}</button>
                      <button type="button" onClick={() => setSelectedOrder(order.id)} className="min-w-0 text-left">
                        <p className="truncate text-xs font-semibold text-ink-900">{order.customer.firstName} {order.customer.lastName}</p>
                        <p className="truncate text-[11px] text-ink-400">{order.email} · {formatDate(order.createdAt)}</p>
                      </button>
                      <span className="text-[11px] text-ink-500">{order.quantity} pièce{order.quantity > 1 ? 's' : ''}<span className="block truncate text-ink-400">{order.products}</span></span>
                      <span className="text-xs font-semibold tabular-nums">{formatMoney(order.totals.totalCents)}</span>
                      <select
                        value={order.status}
                        onChange={e => void setStatus(order.id, e.target.value as OrderStatus)}
                        className="min-h-8 rounded-lg border border-ink-200 bg-white px-2 text-[11px] font-semibold"
                        aria-label={`Statut de la commande ${order.number}`}
                      >
                        {STATUSES.map(status => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}
                      </select>
                      <button type="button" onClick={() => setSelectedOrder(order.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-500 hover:border-ink-950 hover:text-ink-950" aria-label={`Ouvrir la commande ${order.number}`}><ExternalLink size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(product => (
            <div key={product.id} className="rounded-2xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-display text-lg uppercase tracking-tight">{product.name} {product.active ? <Badge tone="mint">Actif</Badge> : <Badge tone="neutral">Inactif</Badge>}</p>
                  <p className="mt-1 text-xs text-ink-500">{product.description}</p>
                  <p className="mt-2 text-[11px] text-ink-400">{product.zones.length} zones · {product.colors.length} coloris · prix de base {formatMoney(product.pricing.basePriceCents)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {product.methods.map(method => {
                      const info = PRINT_METHODS[method];
                      return <Badge key={method} tone={info.productionReady ? 'mint' : 'neutral'}>{info.name}{info.productionReady ? '' : ' · phase 5'}</Badge>;
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(product)}>Modifier</Button>
                  <Button variant={product.active ? 'ghost' : 'primary'} size="sm" onClick={() => void toggleProduct(product)}>
                    {product.active ? <><X size={14} /> Désactiver</> : <><Check size={14} /> Activer</>}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {!products.length ? (
            <div className="rounded-3xl border border-dashed border-ink-300 bg-white/50 px-6 py-14 text-center text-sm text-ink-500">
              <Boxes size={24} className="mx-auto text-ink-300" />
              <p className="mt-2 font-display text-lg uppercase tracking-tight text-ink-900">Aucun produit</p>
              <p className="mt-1">La base doit être migrée et initialisée (seed).</p>
            </div>
          ) : null}
        </div>
      )}

      {selectedOrder ? (
        <OrderDetail id={selectedOrder} onClose={() => setSelectedOrder(null)} onStatus={status => setStatus(selectedOrder, status)} />
      ) : null}
      {editing ? (
        <ProductEditor product={editing} onClose={() => setEditing(null)} onSaved={saved => setProducts(current => current.map(p => p.id === saved.id ? saved : p))} />
      ) : null}
    </Container>
  );
}
