import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CreditCard, FileImage, Loader2, Lock, PackageCheck, Ruler, ShieldCheck,
  Truck,
} from 'lucide-react';
import {
  MATERIAL_LABELS, PRINT_METHODS, PREVIEW_LABELS, PREVIEW_VIEWS, formatMoney,
  type CheckoutPayload, type CustomerInfo, type QuoteResponse,
} from '@dprinting/core';
import { api } from '../lib/api';
import { clearDraft, readDraft, rememberOrder, type OrderDraft } from '../lib/draft';
import { navigate, Link } from '../lib/router';
import { useTitle } from '../lib/useTitle';
import { Container } from '../components/Layout';
import { Badge, Button, EmptyState, Field, Input, Notice, Spinner, Textarea, cn } from '../components/ui';

const EMPTY_CUSTOMER: CustomerInfo = {
  firstName: '', lastName: '', email: '', phone: '',
  addressLine1: '', addressLine2: '', postalCode: '', city: '', country: 'France', notes: '',
};

type Errors = Partial<Record<keyof CustomerInfo, string>>;

function validate(customer: CustomerInfo): Errors {
  const errors: Errors = {};
  if (!customer.firstName.trim()) errors.firstName = 'Prénom requis.';
  if (!customer.lastName.trim()) errors.lastName = 'Nom requis.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email.trim())) errors.email = 'Adresse e-mail invalide.';
  if (customer.phone.trim().length < 5) errors.phone = 'Numéro de téléphone requis.';
  if (customer.addressLine1.trim().length < 3) errors.addressLine1 = 'Adresse requise.';
  if (customer.postalCode.trim().length < 2) errors.postalCode = 'Code postal requis.';
  if (customer.city.trim().length < 2) errors.city = 'Ville requise.';
  if (customer.country.trim().length < 2) errors.country = 'Pays requis.';
  return errors;
}

function variantLabel(draft: OrderDraft): string {
  return draft.variants
    .map(v => `${draft.productName} · ${draft.colorName} · ${v.sizeId ?? 'taille unique'} × ${v.quantity}`)
    .join(' — ');
}

export function Checkout() {
  useTitle('Finaliser la commande');
  const [draft] = useState<OrderDraft | null>(() => readDraft());
  const [customer, setCustomer] = useState<CustomerInfo>(EMPTY_CUSTOMER);
  const [errors, setErrors] = useState<Errors>({});
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!draft) return;
    let alive = true;
    setQuoting(true);
    setQuoteError(null);
    api.quote({
      productId: draft.productId,
      printMethod: draft.printMethod,
      material: draft.material,
      variants: draft.variants,
      zones: draft.zones.map(z => ({ zoneId: z.zoneId, widthMm: z.widthMm, heightMm: z.heightMm })),
    })
      .then(result => { if (alive) setQuote(result); })
      .catch((err: Error) => { if (alive) { setQuote(null); setQuoteError(err.message); } })
      .finally(() => { if (alive) setQuoting(false); });
    return () => { alive = false; };
  }, [draft]);

  const quantity = useMemo(() => draft?.variants.reduce((sum, v) => sum + v.quantity, 0) ?? 0, [draft]);
  const method = draft ? PRINT_METHODS[draft.printMethod] : null;

  if (!draft) {
    return (
      <Container className="py-16 sm:py-24">
        <EmptyState
          title="Aucune commande en préparation"
          action={<Link to="/studio/tshirt"><Button>Ouvrir le studio <ArrowRight size={16} /></Button></Link>}
        >
          Composez un design, vérifiez les quatre aperçus 3D et le serveur calculera le prix avant de passer commande.
        </EmptyState>
      </Container>
    );
  }

  const totalCents = quote?.totalCents ?? null;
  const priceChanged = quote && quote.totalCents !== draft.quotedTotalCents;

  const update = (key: keyof CustomerInfo, value: string) => {
    setCustomer(current => ({ ...current, [key]: value }));
    if (errors[key]) setErrors(current => ({ ...current, [key]: undefined }));
  };

  const submit = async () => {
    setSubmitError(null);
    const found = validate(customer);
    setErrors(found);
    if (Object.keys(found).length) {
      setSubmitError('Vérifiez les champs signalés avant de continuer.');
      return;
    }
    if (!quote) {
      setSubmitError('Le devis serveur n’est pas disponible. Réessayez dans un instant.');
      return;
    }
    if (!accepted) {
      setSubmitError('Confirmez la vérification des aperçus et des fichiers de production.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: CheckoutPayload = {
        customer: {
          ...customer,
          firstName: customer.firstName.trim(),
          lastName: customer.lastName.trim(),
          email: customer.email.trim().toLowerCase(),
          phone: customer.phone.trim(),
          addressLine1: customer.addressLine1.trim(),
          addressLine2: customer.addressLine2?.trim() || undefined,
          postalCode: customer.postalCode.trim(),
          city: customer.city.trim(),
          country: customer.country.trim(),
          notes: customer.notes?.trim() || undefined,
        },
        items: [{
          productId: draft.productId,
          printMethod: draft.printMethod,
          material: draft.material,
          designId: draft.designId,
          variants: draft.variants,
          previewColorId: draft.previewColorId,
          previews: {
            face: draft.previews.face.assetId,
            back: draft.previews.back.assetId,
            left: draft.previews.left.assetId,
            right: draft.previews.right.assetId,
          },
          productionAssets: draft.production.map(p => ({ zoneId: p.zoneId, assetId: p.assetId })),
        }],
      };
      const result = await api.placeOrder(payload);
      rememberOrder({ id: result.order.id, number: result.order.number, token: result.accessToken, createdAt: result.order.createdAt });
      clearDraft();
      navigate(`/suivi/${result.order.id}?access=${encodeURIComponent(result.accessToken)}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'La commande n’a pas pu être enregistrée.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container className="py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={`/studio/${draft.productId}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-400 hover:text-ink-950">
            <ArrowLeft size={14} /> Retour au studio
          </Link>
          <h1 className="mt-2 font-display text-3xl uppercase leading-none tracking-tight sm:text-4xl">Finaliser la commande</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
            Le prix ci-dessous est recalculé par le serveur à partir du design enregistré. Aucun montant fourni par le navigateur n’est utilisé.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="mint"><ShieldCheck size={12} /> Prix serveur</Badge>
          <Badge tone="cobalt"><FileImage size={12} /> PNG 300 DPI</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-ink-200 bg-white p-4 sm:p-6">
            <h2 className="font-display text-lg uppercase tracking-tight">1 · Votre design</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-2xl border border-ink-200 bg-paper-deep">
                <img
                  src={draft.previews.face.url}
                  alt={`Aperçu ${PREVIEW_LABELS.face} du design`}
                  className="aspect-[4/5] w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div>
                <p className="text-sm font-semibold">{variantLabel(draft)}</p>
                <dl className="mt-3 space-y-1.5 text-xs text-ink-500">
                  <div className="flex justify-between gap-3"><dt>Méthode</dt><dd className="font-semibold text-ink-800">{method?.name ?? draft.printMethod}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Matière</dt><dd className="font-semibold text-ink-800">{MATERIAL_LABELS[draft.material]}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Coloris</dt><dd className="flex items-center gap-1.5 font-semibold text-ink-800"><span className="h-3 w-3 rounded-full border border-ink-200" style={{ backgroundColor: draft.colorHex }} />{draft.colorName}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Quantité</dt><dd className="font-semibold text-ink-800">{quantity} pièce{quantity > 1 ? 's' : ''}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Design</dt><dd className="font-mono text-[10px] text-ink-400">{draft.designId.slice(0, 8)}…</dd></div>
                </dl>
              </div>
            </div>

            <p className="mt-5 text-[10px] font-bold uppercase tracking-wider text-ink-400">Quatre aperçus enregistrés</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {PREVIEW_VIEWS.map(view => (
                <figure key={view} className="overflow-hidden rounded-xl border border-ink-200 bg-paper-deep">
                  <img src={draft.previews[view].url} alt={`Aperçu ${PREVIEW_LABELS[view]}`} className="aspect-[4/5] w-full object-cover" loading="lazy" />
                  <figcaption className="px-1.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-500">{PREVIEW_LABELS[view]}</figcaption>
                </figure>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-ink-200 bg-paper-deep/60 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-500"><Ruler size={13} /> Fichiers de production</p>
              <ul className="mt-2 space-y-1.5">
                {draft.production.map(file => (
                  <li key={file.zoneId} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-600">
                    <span className="font-semibold text-ink-800">{draft.zones.find(z => z.zoneId === file.zoneId)?.label ?? file.zoneId}</span>
                    <span className="tabular-nums">{file.widthMm} × {file.heightMm} mm · {file.widthPx} × {file.heightPx} px · {file.dpi} DPI</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
                PNG transparents distincts des aperçus 3D. Le serveur revérifie dimensions, résolution et appartenance au design avant d’accepter la commande.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-ink-200 bg-white p-4 sm:p-6">
            <h2 className="font-display text-lg uppercase tracking-tight">2 · Livraison</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Prénom" htmlFor="firstName" error={errors.firstName}>
                <Input id="firstName" autoComplete="given-name" value={customer.firstName} onChange={e => update('firstName', e.target.value)} />
              </Field>
              <Field label="Nom" htmlFor="lastName" error={errors.lastName}>
                <Input id="lastName" autoComplete="family-name" value={customer.lastName} onChange={e => update('lastName', e.target.value)} />
              </Field>
              <Field label="E-mail" htmlFor="email" error={errors.email}>
                <Input id="email" type="email" inputMode="email" autoComplete="email" value={customer.email} onChange={e => update('email', e.target.value)} />
              </Field>
              <Field label="Téléphone" htmlFor="phone" error={errors.phone}>
                <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={customer.phone} onChange={e => update('phone', e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Adresse" htmlFor="addressLine1" error={errors.addressLine1}>
                  <Input id="addressLine1" autoComplete="address-line1" value={customer.addressLine1} onChange={e => update('addressLine1', e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Complément d’adresse" htmlFor="addressLine2" hint="facultatif">
                  <Input id="addressLine2" autoComplete="address-line2" value={customer.addressLine2 ?? ''} onChange={e => update('addressLine2', e.target.value)} />
                </Field>
              </div>
              <Field label="Code postal" htmlFor="postalCode" error={errors.postalCode}>
                <Input id="postalCode" autoComplete="postal-code" value={customer.postalCode} onChange={e => update('postalCode', e.target.value)} />
              </Field>
              <Field label="Ville" htmlFor="city" error={errors.city}>
                <Input id="city" autoComplete="address-level2" value={customer.city} onChange={e => update('city', e.target.value)} />
              </Field>
              <Field label="Pays" htmlFor="country" error={errors.country}>
                <Input id="country" autoComplete="country-name" value={customer.country} onChange={e => update('country', e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Instructions de production" htmlFor="notes" hint="facultatif">
                  <Textarea id="notes" value={customer.notes ?? ''} onChange={e => update('notes', e.target.value)} placeholder="Précisions utiles à l’atelier : position souhaitée, date, etc." />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-ink-200 bg-white p-4 sm:p-6">
            <h2 className="font-display text-lg uppercase tracking-tight">3 · Validation</h2>
            <div className="mt-3 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-200 bg-paper-deep/50 p-3 text-xs leading-relaxed text-ink-600">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
                <span>J’ai vérifié les quatre aperçus et les dimensions des fichiers de production. Les fichiers seront imprimés tels qu’ils ont été générés.</span>
              </label>
              <Notice tone="info" title="Paiement en ligne non activé">
                Aucun paiement n’est encaissé en v1. Votre commande est enregistrée au statut « en attente » avec ses fichiers ; l’atelier la confirme ensuite. Vous conservez un lien de suivi privé sur cet appareil.
              </Notice>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-soft">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Récapitulatif</p>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-500">Sous-total</span>
              <span className="tabular-nums">{quote ? formatMoney(quote.subtotalCents) : '—'}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-500">Remise quantité</span>
              <span className={cn('tabular-nums', quote && quote.discountCents > 0 && 'text-mint')}>{quote ? formatMoney(-quote.discountCents) : '—'}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-500">Livraison</span>
              <span className="tabular-nums text-mint">Offerte</span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-ink-100 pt-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Total TTC</p>
                <p className="font-display text-3xl leading-none">{quote ? formatMoney(quote.totalCents) : '—'}</p>
              </div>
              {quoting ? <Loader2 size={18} className="animate-spin text-ink-400" /> : null}
            </div>
            {quote ? <p className="mt-1 text-[11px] text-ink-400">{formatMoney(quote.unitPriceCents)} l’unité · {quantity} pièce{quantity > 1 ? 's' : ''}</p> : null}

            {quoteError ? <div className="mt-3"><Notice tone="warning">{quoteError}</Notice></div> : null}
            {priceChanged ? (
              <div className="mt-3"><Notice tone="warning">Le devis serveur a évolué depuis la préparation. Le montant ci-dessus est le seul applicable.</Notice></div>
            ) : null}

            {submitError ? <div className="mt-3"><Notice tone="danger">{submitError}</Notice></div> : null}

            <Button
              className="mt-4"
              block
              size="lg"
              disabled={submitting || quoting || !quote || Boolean(quoteError)}
              onClick={() => void submit()}
            >
              {submitting ? <><Loader2 size={18} className="animate-spin" /> Enregistrement…</> : <>Confirmer la commande <PackageCheck size={18} /></>}
            </Button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[10px] text-ink-400">
              <Lock size={11} /> Commande invitée · lien de suivi privé
            </p>
          </div>

          <div className="rounded-3xl border border-ink-200 bg-white/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Ce qui est transmis</p>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-ink-500">
              <li className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-mint" /> Le design vectoriel/bitmap enregistré côté serveur.</li>
              <li className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-mint" /> Les quatre aperçus 3D, tous liés à ce design.</li>
              <li className="flex gap-2"><Check size={13} className="mt-0.5 shrink-0 text-mint" /> Un PNG de production par zone imprimée.</li>
              <li className="flex gap-2"><CreditCard size={13} className="mt-0.5 shrink-0 text-ink-300" /> Aucune donnée bancaire : le paiement n’est pas activé.</li>
            </ul>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-ink-200 bg-white/70 px-4 py-3 text-[11px] text-ink-500">
            <Truck size={16} className="shrink-0 text-ink-400" />
            Fabrication à la demande après confirmation de l’atelier.
          </div>
        </aside>
      </div>
    </Container>
  );
}
