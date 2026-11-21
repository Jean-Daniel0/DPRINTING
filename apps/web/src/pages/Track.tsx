import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight, Check, ClipboardCopy, Clock, Copy, FileImage, Loader2, MapPin, Package, RefreshCw,
  Search, ShieldCheck, Truck, X,
} from 'lucide-react';
import {
  ORDER_STATUS_LABELS, PREVIEW_LABELS, PREVIEW_VIEWS, PRINT_METHODS, formatMoney,
  type OrderRecord, type OrderStatus,
} from '@dprinting/core';
import { api } from '../lib/api';
import { orderToken, rememberOrder, storedOrders, type StoredOrder } from '../lib/draft';
import { navigate, Link } from '../lib/router';
import { useTitle } from '../lib/useTitle';
import { Container } from '../components/Layout';
import { Badge, Button, EmptyState, Field, Input, Notice, Spinner, cn } from '../components/ui';

const TIMELINE: { status: OrderStatus; label: string; icon: typeof Clock }[] = [
  { status: 'pending', label: 'Enregistrée', icon: Clock },
  { status: 'confirmed', label: 'Confirmée', icon: Check },
  { status: 'in_production', label: 'En production', icon: Package },
  { status: 'shipped', label: 'Expédiée', icon: Truck },
];

const STATUS_TONE: Record<OrderStatus, 'neutral' | 'gold' | 'mint' | 'danger' | 'cobalt'> = {
  pending: 'gold',
  confirmed: 'cobalt',
  in_production: 'cobalt',
  shipped: 'mint',
  cancelled: 'danger',
};

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function TrackingForm({ initialId = '', initialAccess = '' }: { initialId?: string; initialAccess?: string }) {
  const [id, setId] = useState(initialId);
  const [access, setAccess] = useState(initialAccess);
  const [error, setError] = useState<string | null>(null);
  const history = storedOrders();

  const submit = () => {
    const cleanId = id.trim().replace(/^.*\/suivi\//, '').split('?')[0];
    let token = access.trim();
    if (!token) token = orderToken(cleanId) ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(cleanId)) { setError('Identifiant de commande invalide.'); return; }
    if (token.length < 20) { setError('Le jeton d’accès est manquant. Utilisez le lien complet reçu après la commande.'); return; }
    navigate(`/suivi/${cleanId}?access=${encodeURIComponent(token)}`);
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-soft sm:p-7">
        <h2 className="font-display text-xl uppercase tracking-tight">Retrouver une commande</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-500">
          Le lien de suivi contient un jeton privé. Collez l’adresse complète ou l’identifiant et le jeton.
        </p>
        <div className="mt-5 space-y-3">
          <Field label="Identifiant de commande" htmlFor="order-id">
            <Input id="order-id" value={id} onChange={e => { setId(e.target.value); setError(null); }} placeholder="00000000-0000-0000-0000-000000000000" />
          </Field>
          <Field label="Jeton d’accès" htmlFor="order-token" hint="fourni une seule fois">
            <Input id="order-token" value={access} onChange={e => { setAccess(e.target.value); setError(null); }} placeholder="Jeton du lien de suivi" />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button block onClick={submit}><Search size={16} /> Ouvrir le suivi</Button>
        </div>
      </div>

      {history.length ? (
        <div className="mt-6">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Commandes de cet appareil</p>
          <ul className="space-y-2">
            {history.map(order => (
              <li key={order.id}>
                <Link to={`/suivi/${order.id}?access=${encodeURIComponent(order.token)}`} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm transition hover:border-ink-950">
                  <span className="flex items-center gap-2 font-semibold"><Package size={16} className="text-ink-400" /> Commande n° {order.number}</span>
                  <span className="flex items-center gap-2 text-[11px] text-ink-400">{formatDate(order.createdAt)} <ArrowRight size={14} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function Track({ id, access }: { id?: string; access?: string }) {
  useTitle(id ? 'Suivi de commande' : 'Suivre une commande');
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [copied, setCopied] = useState(false);

  const token = access || (id ? orderToken(id) ?? '' : '');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.order(id, token);
      setOrder(res.order);
      rememberOrder({ id: res.order.id, number: res.order.number, token, createdAt: res.order.createdAt });
    } catch (err) {
      setOrder(null);
      setError(err instanceof Error ? err.message : 'Commande introuvable.');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { void load(); }, [load]);

  if (!id) {
    return (
      <Container className="py-10 sm:py-16">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cobalt">Suivi privé</p>
          <h1 className="mt-2 font-display text-3xl uppercase leading-none tracking-tight sm:text-4xl">Où en est ma commande ?</h1>
        </div>
        <TrackingForm />
        <div className="mx-auto mt-8 max-w-xl">
          <Notice tone="info" title="Aucun compte requis">
            Chaque commande invitée possède un jeton d’accès stocké sur l’appareil qui l’a passée. Il n’est jamais réutilisable par un tiers et peut être copié depuis le lien de suivi.
          </Notice>
        </div>
      </Container>
    );
  }

  if (loading) return <Container className="py-24"><Spinner label="Chargement de la commande…" /></Container>;

  if (error || !order) {
    return (
      <Container className="py-16">
        <Notice tone="danger" title="Commande inaccessible">
          {error ?? 'Commande introuvable.'} Le lien est peut-être incomplet ou a été généré sur un autre appareil.
        </Notice>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/suivi"><Button variant="secondary">Saisir un autre identifiant</Button></Link>
          <Button variant="ghost" onClick={() => void load()}><RefreshCw size={15} /> Réessayer</Button>
        </div>
      </Container>
    );
  }

  const cancelled = order.status === 'cancelled';
  const currentIndex = TIMELINE.findIndex(step => step.status === order.status);
  const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const copyLink = async () => {
    const url = `${window.location.origin}/suivi/${order.id}?access=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Copiez le lien de suivi :', url);
    }
  };

  return (
    <Container className="py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cobalt">Commande n° {order.number}</p>
          <h1 className="mt-1 font-display text-3xl uppercase leading-none tracking-tight sm:text-4xl">Suivi de production</h1>
          <p className="mt-2 text-sm text-ink-500">Enregistrée le {formatDate(order.createdAt)} · dernière mise à jour {formatDate(order.updatedAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
          <Button variant="secondary" size="sm" onClick={() => void load()}><RefreshCw size={14} /> Actualiser</Button>
          <Button variant="secondary" size="sm" onClick={() => void copyLink()}>{copied ? <ClipboardCopy size={14} /> : <Copy size={14} />} {copied ? 'Copié' : 'Copier le lien'}</Button>
        </div>
      </div>

      {cancelled ? (
        <Notice tone="danger" title="Commande annulée">
          Cette commande a été annulée. Aucun fichier ne sera envoyé en fabrication. Contactez l’atelier si vous pensez qu’il s’agit d’une erreur.
        </Notice>
      ) : (
        <ol className="grid gap-2 rounded-3xl border border-ink-200 bg-white p-3 sm:grid-cols-4 sm:p-4">
          {TIMELINE.map((step, index) => {
            const Icon = step.icon;
            const done = index <= currentIndex;
            const active = index === currentIndex;
            return (
              <li key={step.status} className={cn('flex items-center gap-3 rounded-2xl px-3 py-2.5', active ? 'bg-ink-950 text-paper' : done ? 'bg-mint/5 text-mint' : 'text-ink-400')}>
                <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full border', active ? 'border-gold bg-gold text-ink-950' : done ? 'border-mint/40 bg-mint/10' : 'border-ink-200 bg-white')}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Étape {index + 1}</p>
                  <p className="truncate text-xs font-semibold">{step.label}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {order.items.map(item => (
            <section key={item.id} className="rounded-3xl border border-ink-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg uppercase tracking-tight">{item.productName}</h2>
                  <p className="text-xs text-ink-500">{PRINT_METHODS[item.printMethod].name} · {item.quantity} pièce{item.quantity > 1 ? 's' : ''}</p>
                </div>
                <p className="font-display text-xl">{formatMoney(item.totalCents)}</p>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {PREVIEW_VIEWS.map(view => {
                  const preview = item.previews.find(p => p.view === view);
                  return (
                    <figure key={view} className="overflow-hidden rounded-xl border border-ink-200 bg-paper-deep">
                      {preview?.url ? (
                        <a href={preview.url} target="_blank" rel="noreferrer">
                          <img src={preview.url} alt={`${PREVIEW_LABELS[view]} — ${item.productName}`} className="aspect-[4/5] w-full object-cover" loading="lazy" />
                        </a>
                      ) : (
                        <div className="grid aspect-[4/5] w-full place-items-center text-[10px] text-ink-400">Indisponible</div>
                      )}
                      <figcaption className="px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-500">{PREVIEW_LABELS[view]}</figcaption>
                    </figure>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-ink-200 bg-paper-deep/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Variantes facturées</p>
                  <ul className="mt-2 space-y-1 text-xs text-ink-600">
                    {item.variants.map(variant => (
                      <li key={`${variant.colorId}-${variant.sizeId}`} className="flex justify-between gap-2">
                        <span>{variant.sizeId ?? 'Taille unique'} × {variant.quantity}</span>
                        <span className="tabular-nums">{formatMoney(variant.lineTotalCents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-ink-200 bg-paper-deep/50 p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400"><FileImage size={12} /> Fichiers de production</p>
                  <ul className="mt-2 space-y-1 text-xs text-ink-600">
                    {item.zones.map(zone => (
                      <li key={zone.zoneId} className="flex justify-between gap-2">
                        <span>{zone.label}</span>
                        <span className="tabular-nums">{zone.widthMm} × {zone.heightMm} mm · {zone.dpi} DPI</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] leading-relaxed text-ink-400">Les fichiers de fabrication ne sont pas téléchargeables depuis le suivi client.</p>
                </div>
              </div>

              <div className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-[11px]">
                {item.pricing.breakdown.map(line => (
                  <div key={line.label} className="flex justify-between gap-3 text-ink-500">
                    <span>{line.label}</span>
                    <span className={cn('tabular-nums', line.amountCents < 0 && 'text-mint')}>{formatMoney(line.amountCents)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-soft">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Total de la commande</p>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="font-display text-3xl leading-none">{formatMoney(order.totalCents)}</span>
              <span className="text-xs text-ink-400">{quantity} pièce{quantity > 1 ? 's' : ''}</span>
            </div>
            <dl className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-[11px] text-ink-500">
              <div className="flex justify-between gap-3"><dt>Sous-total</dt><dd className="tabular-nums">{formatMoney(order.subtotalCents)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Remise</dt><dd className={cn('tabular-nums', order.discountCents > 0 && 'text-mint')}>{formatMoney(-order.discountCents)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Livraison</dt><dd className="tabular-nums">{order.shippingCents ? formatMoney(order.shippingCents) : 'Offerte'}</dd></div>
            </dl>
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-ink-400"><ShieldCheck size={12} /> Aucun paiement encaissé en v1</p>
          </div>

          <div className="rounded-3xl border border-ink-200 bg-white p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400"><MapPin size={12} /> Livraison</p>
            <address className="mt-2 space-y-0.5 text-sm not-italic leading-relaxed text-ink-700">
              <p className="font-semibold text-ink-950">{order.customer.firstName} {order.customer.lastName}</p>
              <p>{order.customer.addressLine1}</p>
              {order.customer.addressLine2 ? <p>{order.customer.addressLine2}</p> : null}
              <p>{order.customer.postalCode} {order.customer.city}</p>
              <p>{order.customer.country}</p>
              <p className="pt-1 text-xs text-ink-500">{order.customer.email}</p>
              <p className="text-xs text-ink-500">{order.customer.phone}</p>
            </address>
            {order.customer.notes ? (
              <p className="mt-3 rounded-xl border border-ink-200 bg-paper-deep/60 p-2.5 text-[11px] leading-relaxed text-ink-500">{order.customer.notes}</p>
            ) : null}
          </div>

          <div className="rounded-3xl border border-ink-200 bg-white/70 p-4 text-[11px] leading-relaxed text-ink-500">
            <p className="font-semibold text-ink-800">Étapes suivantes</p>
            <p className="mt-1">L’atelier vérifie les fichiers, confirme la commande, lance la production puis l’expédition. Le statut de cette page est mis à jour par l’administration.</p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
