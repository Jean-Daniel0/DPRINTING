import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Box, Check, FileImage, Layers, Palette, Ruler, ShieldCheck, Sparkles, Truck, X,
} from 'lucide-react';
import { PRINT_METHODS, formatMoney, type ProductDef } from '@dprinting/core';
import { api } from '../lib/api';
import { fromPriceCents } from '../lib/design';
import { Link } from '../lib/router';
import { useTitle } from '../lib/useTitle';
import { Container } from '../components/Layout';
import { Badge, Button, Notice, SectionTitle, Spinner } from '../components/ui';
import { ShirtViewer } from '../components/ShirtViewer';
import type { PrintPanel } from '../three/TshirtScene';

function makeDemoCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const star = (cx: number, cy: number, outer: number, inner: number) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  ctx.fillStyle = '#f2c14e';
  star(450, 255, 92, 38);
  ctx.fill();
  ctx.fillStyle = '#11151f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 156px "Archivo Black", Inter, sans-serif';
  ctx.fillText('DPRINTING', 450, 545);
  ctx.font = '600 34px Inter, sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillStyle = '#2f4bd8';
  ctx.fillText('ATELIER 01', 450, 660);
  ctx.strokeStyle = '#11151f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(180, 740);
  ctx.lineTo(720, 740);
  ctx.stroke();
  ctx.font = '500 25px Inter, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillStyle = '#5c6577';
  ctx.fillText('IMPRIMÉ À LA DEMANDE', 450, 810);
  return canvas;
}

const STEPS = [
  { n: '01', title: 'Composez en millimètres', text: 'Texte, formes et images sont placés dans une zone dont les dimensions physiques sont réelles. Les guides et l’aimantation évitent les mauvaises surprises.', icon: Ruler },
  { n: '02', title: 'Vérifiez sur le vêtement', text: 'Le rendu 3D projette votre design sur les coordonnées du tissu. Les quatre vues de commande sont générées par le même moteur 2D, sans décalage.', icon: Box },
  { n: '03', title: 'Recevez un fichier de production', text: 'Chaque zone imprimée devient un PNG transparent à ses dimensions exactes et à 300 DPI, contrôlé par le serveur avant d’entrer en fabrication.', icon: FileImage },
];

export function Home() {
  useTitle('Studio de personnalisation 3D');
  const [products, setProducts] = useState<ProductDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoVersion, setDemoVersion] = useState(0);

  useEffect(() => {
    api.catalog()
      .then(res => setProducts(res.products.filter(p => p.active)))
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) setDemoVersion(v => v + 1); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const demoPanels = useMemo<Partial<Record<'front' | 'back', PrintPanel>>>(() => ({
    front: {
      canvas: makeDemoCanvas(),
      rect: { uMin: -150, uMax: 150, vMin: 70, vMax: 470 },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [demoVersion]);

  return (
    <>
      <section className="relative overflow-hidden border-b border-ink-200">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gold/20 blur-3xl" />
        <Container className="grid items-center gap-10 py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-16">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="gold"><Sparkles size={12} /> Studio autonome</Badge>
              <Badge tone="cobalt">Sans service de mockup externe</Badge>
            </div>
            <h1 className="mt-5 font-display text-[clamp(2.6rem,7vw,5.4rem)] uppercase leading-[0.92] tracking-[-0.03em]">
              Votre design.<br />
              <span className="text-cobalt">Quatre angles.</span><br />
              Une pièce à votre nom.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
              Un studio de personnalisation textile qui travaille en millimètres réels : éditeur 2D, aperçu 3D projeté sur le tissu et fichiers de production générés par le même moteur.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/studio/tshirt"><Button size="lg">Ouvrir le studio <ArrowRight size={18} /></Button></Link>
              <Link to="/produit/tshirt"><Button size="lg" variant="secondary">Découvrir le T-shirt</Button></Link>
            </div>
            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-ink-200 pt-5">
              <div><dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Précision</dt><dd className="mt-1 font-condensed text-3xl leading-none">1 mm</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Production</dt><dd className="mt-1 font-condensed text-3xl leading-none">300 DPI</dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Aperçus</dt><dd className="mt-1 font-condensed text-3xl leading-none">4 vues</dd></div>
            </dl>
          </div>
          <div className="relative">
            <ShirtViewer className="aspect-[4/5] w-full shadow-lift sm:aspect-[5/5]" color="#f5f5f2" panels={demoPanels} showControls hint />
            <div className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-700 shadow-soft backdrop-blur">
              Aperçu 3D temps réel
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-12 sm:py-16">
        <div className="grid gap-px overflow-hidden rounded-3xl border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Ruler, title: 'Dimensions physiques', text: 'Chaque calque est mesuré en millimètres sur le vêtement, pas en pixels.' },
            { icon: Layers, title: 'Un seul moteur 2D', text: 'Éditeur, 3D et export de production lisent le même document.' },
            { icon: ShieldCheck, title: 'Prix côté serveur', text: 'Le total est recalculé par l’API : aucun prix client n’est accepté.' },
            { icon: Truck, title: 'Commande suivie', text: 'Quatre aperçus et un PNG par zone, archivés avec la commande.' },
          ].map(item => (
            <div key={item.title} className="bg-paper p-5">
              <item.icon size={20} className="text-cobalt" />
              <p className="mt-3 text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{item.text}</p>
            </div>
          ))}
        </div>
      </Container>

      <Container className="py-8 sm:py-12">
        <SectionTitle eyebrow="Le produit" title="Un T-shirt, un vrai studio" action={<Link to="/produit/tshirt" className="text-sm font-semibold text-cobalt hover:underline">Voir la fiche produit →</Link>}>
          Jersey peigné unisexe, 12 coloris, du XS au 3XL. Personnalisable devant et dos, avec une zone imprimable mesurée sur le patron réel.
        </SectionTitle>
        <div className="mt-7">
          {error ? <Notice tone="danger" title="Catalogue indisponible">{error}</Notice> : null}
          {!products && !error ? <div className="py-10"><Spinner label="Chargement du catalogue…" /></div> : null}
          {products?.map(product => {
            const price = fromPriceCents(product);
            return (
              <article key={product.id} className="grid overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-soft lg:grid-cols-[1.1fr_1fr]">
                <div className="relative min-h-[320px] bg-[#efece5] p-4">
                  <ShirtViewer color={product.colors[0]?.hex ?? '#f5f5f2'} className="h-full min-h-[300px] w-full" showControls={false} />
                  <div className="absolute left-5 top-5 flex flex-col items-start gap-2">
                    <Badge tone="gold">Nouveau</Badge>
                    <Badge>{product.category}</Badge>
                  </div>
                </div>
                <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-display text-3xl uppercase tracking-tight">{product.name}</h3>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">{product.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">À partir de</p>
                        <p className="font-display text-2xl">{price !== null ? formatMoney(price) : '—'}</p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Zones</p>
                        <p className="mt-1 text-ink-700">{product.zones.map(z => `${z.label} ${z.widthMm}×${z.heightMm} mm`).join(' · ')}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Tailles</p>
                        <p className="mt-1 text-ink-700">{product.sizes.join(' · ')}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-1.5">
                      {product.colors.map(color => (
                        <span key={color.id} title={color.name} className="h-7 w-7 rounded-full border border-ink-200" style={{ backgroundColor: color.hex }} />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link to={`/studio/${product.id}`}><Button>Personnaliser <ArrowRight size={17} /></Button></Link>
                    <Link to={`/produit/${product.id}`}><Button variant="secondary">Détails</Button></Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Container>

      <section className="border-y border-ink-200 bg-paper-deep/60">
        <Container className="py-14">
          <SectionTitle eyebrow="Le parcours" title="Du calque au colis, sans boîte noire">
            Trois étapes, un seul document de design. Aucune donnée statique ne simule une fonctionnalité : si un maillon n’est pas prêt, il est signalé.
          </SectionTitle>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {STEPS.map(step => (
              <div key={step.n} className="relative rounded-3xl border border-ink-200 bg-paper p-6">
                <span className="font-condensed text-5xl leading-none text-ink-200">{step.n}</span>
                <step.icon size={22} className="mt-4 text-cobalt" />
                <h3 className="mt-3 font-display text-lg uppercase tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{step.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-14">
        <SectionTitle eyebrow="Méthodes" title="Ce qui est réellement commandable">
          Le catalogue distingue les méthodes prises en charge par la chaîne de production des méthodes encore en développement.
        </SectionTitle>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(['dtf', 'dtg', 'sublimation'] as const).map(id => {
            const method = PRINT_METHODS[id];
            return (
              <div key={id} className="rounded-3xl border border-ink-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-xl uppercase tracking-tight">{method.name}</h3>
                  <Badge tone="mint"><Check size={12} /> Commandable</Badge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-500">
                  {id === 'dtf' && 'Transfert à chaud, couleurs vives, adapté aux cotons et mélanges. Fichier PNG transparent à 300 DPI.'}
                  {id === 'dtg' && 'Impression directe sur coton, toucher souple. Réservée aux textiles contenant du coton.'}
                  {id === 'sublimation' && 'Encre intégrée au polyester, aucune surépaisseur. Exige un textile 100 % polyester clair.'}
                </p>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Résolution minimale {method.minDpi} DPI</p>
              </div>
            );
          })}
          <div className="rounded-3xl border border-dashed border-ink-300 bg-paper-deep/40 p-5 sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="neutral"><X size={12} /> En développement</Badge>
              <p className="text-sm font-semibold">Sérigraphie · Vinyle thermocollant · Broderie</p>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-500">
              Ces méthodes restent visibles dans le catalogue, mais le studio et l’API refusent toute commande tant que leur fichier de production spécifique (films de séparation, découpe vectorielle, points DST) n’est pas développé. Aucun bouton factice n’est affiché.
            </p>
          </div>
        </div>
      </Container>

      <Container className="pb-16">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink-950 p-7 text-paper sm:p-12">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cobalt/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.2fr_auto]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Prêt à imprimer</p>
              <h2 className="mt-2 font-display text-3xl uppercase leading-tight tracking-tight sm:text-4xl">Ouvrez le studio et composez votre première pièce.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-300">
                Le design est conservé côté serveur au moment de la commande, avec ses quatre aperçus et ses fichiers de production. Le règlement en ligne n’étant pas activé, chaque commande est confirmée par l’équipe avant fabrication.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/studio/tshirt"><Button size="lg" variant="gold">Créer mon design <ArrowRight size={18} /></Button></Link>
              <Link to="/suivi"><Button size="lg" variant="ghost" className="border-white/20 text-paper hover:bg-white/10">Suivre une commande</Button></Link>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
