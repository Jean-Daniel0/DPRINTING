import { useEffect, useState } from 'react';
import { ArrowRight, Check, Minus, Ruler, ShieldCheck, X } from 'lucide-react';
import {
  MATERIAL_LABELS, PRINT_METHODS, formatMoney, printMethodAvailability,
  type MaterialId, type PreviewView, type ProductDef,
} from '@dprinting/core';
import { api } from '../lib/api';
import { fromPriceCents } from '../lib/design';
import { Link } from '../lib/router';
import { useTitle } from '../lib/useTitle';
import { Container } from '../components/Layout';
import { ShirtViewer } from '../components/ShirtViewer';
import { Badge, Button, Notice, Spinner } from '../components/ui';

export function Product({ id }: { id: string }) {
  const [product, setProduct] = useState<ProductDef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [colorId, setColorId] = useState<string>('');
  const [material, setMaterial] = useState<MaterialId>('cotton');
  const [view, setView] = useState<PreviewView>('face');

  useTitle(product ? product.name : 'Produit');

  useEffect(() => {
    let alive = true;
    setError(null);
    api.product(id)
      .then(res => {
        if (!alive) return;
        setProduct(res.product);
        setColorId(res.product.colors[0]?.id ?? '');
        setMaterial(res.product.defaultMaterial);
      })
      .catch((err: Error) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [id]);

  if (error) {
    return (
      <Container className="py-16">
        <Notice tone="danger" title="Produit indisponible">{error}</Notice>
        <div className="mt-5"><Link to="/"><Button variant="secondary">Retour à l’accueil</Button></Link></div>
      </Container>
    );
  }

  if (!product) return <Container className="py-24"><Spinner label="Chargement du produit…" /></Container>;

  const color = product.colors.find(c => c.id === colorId) ?? product.colors[0];
  const price = fromPriceCents(product);
  const availability = printMethodAvailability(product, material, color.hex);
  const orderable = availability.filter(a => a.orderable && a.ok);
  const unavailable = availability.filter(a => !a.orderable || !a.ok);

  return (
    <Container className="py-8 sm:py-12">
      <nav className="mb-6 flex items-center gap-2 text-xs text-ink-400" aria-label="Fil d’Ariane">
        <Link to="/" className="hover:text-ink-950">Accueil</Link>
        <span>/</span>
        <span className="text-ink-700">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ShirtViewer
            color={color.hex}
            view={view}
            onViewChange={setView}
            className="aspect-[4/5] w-full shadow-lift"
            hint
          />
          <div className="mt-4 rounded-2xl border border-ink-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Coloris · {color.name}</p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {product.colors.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColorId(c.id)}
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={c.id === color.id}
                  className={`grid h-9 w-9 place-items-center rounded-full border-2 transition ${c.id === color.id ? 'border-ink-950 ring-2 ring-ink-950/10' : 'border-white shadow-[0_0_0_1px_rgba(10,13,20,0.18)] hover:scale-105'}`}
                  style={{ backgroundColor: c.hex }}
                >
                  {c.id === color.id ? <Check size={14} className={c.hex.toLowerCase() > '#999999' ? 'text-ink-950' : 'text-white'} /> : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gold">{product.category}</Badge>
            <Badge tone="mint"><ShieldCheck size={12} /> Fichier 300 DPI</Badge>
          </div>
          <h1 className="mt-4 font-display text-4xl uppercase leading-none tracking-tight sm:text-5xl">{product.name}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-500">{product.description}</p>

          <div className="mt-6 flex items-end gap-3 border-y border-ink-200 py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">À partir de</p>
              <p className="font-display text-3xl">{price !== null ? formatMoney(price) : '—'}</p>
            </div>
            <p className="pb-1 text-xs text-ink-400">TTC, impression 100 × 100 mm incluse</p>
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Matière</p>
            <div className="flex flex-wrap gap-2">
              {product.materials.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMaterial(m)}
                  aria-pressed={material === m}
                  className={`min-h-10 rounded-full border px-4 text-xs font-semibold transition ${material === m ? 'border-ink-950 bg-ink-950 text-paper' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-950'}`}
                >
                  {MATERIAL_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Méthodes d’impression</p>
            <ul className="mt-3 space-y-2">
              {availability.map(item => {
                const method = PRINT_METHODS[item.method];
                const usable = item.ok && item.orderable;
                return (
                  <li key={item.method} className={`rounded-2xl border p-4 ${usable ? 'border-mint/30 bg-mint/5' : 'border-ink-200 bg-white/60'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {usable ? <Check size={15} className="text-mint" /> : <Minus size={15} className="text-ink-400" />}
                        {method.name}
                      </span>
                      <Badge tone={usable ? 'mint' : 'neutral'}>{usable ? 'Commandable' : 'Indisponible'}</Badge>
                    </div>
                    {!item.ok ? <p className="mt-1.5 text-xs text-ink-500">{item.reason}</p> : null}
                    {item.ok && !item.orderable ? <p className="mt-1.5 text-xs text-ink-500">{item.statusNote}</p> : null}
                  </li>
                );
              })}
            </ul>
            {unavailable.length ? (
              <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
                Les méthodes indisponibles restent affichées par transparence : aucune commande ne peut être passée avec elles.
              </p>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 rounded-2xl border border-ink-200 bg-white p-5 sm:grid-cols-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-500"><Ruler size={14} /> Zones imprimables</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                {product.zones.map(z => <li key={z.id}>{z.label} : {z.widthMm} × {z.heightMm} mm</li>)}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Tailles</p>
              <p className="mt-2 text-sm text-ink-700">{product.sizes.join(' · ')}</p>
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-ink-500">Coloris</p>
              <p className="mt-1 text-sm text-ink-700">{product.colors.length} disponibles</p>
            </div>
          </div>

          {orderable.length ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to={`/studio/${product.id}`}><Button size="lg">Personnaliser ce produit <ArrowRight size={18} /></Button></Link>
              <span className="text-xs text-ink-400">Aperçu 3D et prix calculés en direct dans le studio.</span>
            </div>
          ) : (
            <Notice tone="warning" title="Aucune méthode compatible">
              Cette combinaison de matière et de couleur ne permet aucune impression commandable. Changez de matière ou de coloris.
            </Notice>
          )}

          <div className="mt-8 rounded-2xl border border-dashed border-ink-300 bg-paper-deep/50 p-4 text-xs leading-relaxed text-ink-500">
            <p className="flex items-center gap-1.5 font-semibold text-ink-800"><X size={13} /> Ce qui n’est pas encore disponible</p>
            <p className="mt-1.5">La sérigraphie, le vinyle thermocollant et la broderie ne peuvent pas être commandés tant que leurs fichiers de production spécifiques ne sont pas développés. Le paiement en ligne n’est pas activé : chaque commande est confirmée par l’équipe.</p>
          </div>
        </div>
      </div>
    </Container>
  );
}
