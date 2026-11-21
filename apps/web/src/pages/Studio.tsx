import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronDown, Layers, Loader2, Minus, Plus, Redo2, RotateCcw, ShoppingBag,
  SlidersHorizontal, Undo2, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  History, MATERIAL_LABELS, PRINT_METHODS, PREVIEW_LABELS, PREVIEW_VIEWS, addLayer, constrainToZone,
  duplicateLayer, findLayer, fitTextLayer, formatMoney, makeImage,
  makeShape, makeText, moveLayer as reorderLayer, printMethodAvailability, printedZones,
  removeLayer, updateLayer, type DesignDocument, type Layer, type MaterialId, type PreviewView,
  type PrintMethodId, type ProductDef, type QuoteResponse, type ShapeKind,
} from '@dprinting/core';
import { api } from '../lib/api';
import {
  ensureDesignImages, loadImage, peekImage, registerAsset, useDesignImages,
} from '../lib/images';
import { emptyDocumentFor, firstOrderableMethod, paintZone, renderProductionPng } from '../lib/design';
import { saveDraft } from '../lib/draft';
import { navigate, Link } from '../lib/router';
import { useTitle } from '../lib/useTitle';
import { Container } from '../components/Layout';
import { ShirtViewer } from '../components/ShirtViewer';
import { Badge, Button, EmptyState, Modal, Notice, Segmented, Spinner, cn } from '../components/ui';
import { StudioCanvas } from '../studio/StudioCanvas';
import { Inspector, LayerPanel } from '../studio/LayerTools';
import type { TshirtScene, PrintPanel } from '../three/TshirtScene';

const EMPTY_DOC: DesignDocument = { version: 1, productId: '', printMethod: 'dtf', zones: {} };
const PANEL_PPM = 3;

function probeContext(): CanvasRenderingContext2D | null {
  return document.createElement('canvas').getContext('2d');
}

function defaultSizes(product: ProductDef): Record<string, number> {
  if (!product.sizes.length) return { default: 1 };
  const chosen = product.sizes.includes('M') ? 'M' : product.sizes[Math.min(2, product.sizes.length - 1)];
  return chosen ? { [chosen]: 1 } : {};
}

function variantsFor(product: ProductDef, colorId: string, quantities: Record<string, number>) {
  const entries = product.sizes.length ? product.sizes.map(size => [size, quantities[size] ?? 0] as const) : [['default', quantities.default ?? 0] as const];
  return entries
    .filter(([, qty]) => qty > 0)
    .map(([size, quantity]) => ({ colorId, sizeId: product.sizes.length ? size : null, quantity }));
}

function OptionSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white/70 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">{title}</h3>
        {hint ? <span className="text-[10px] text-ink-400">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function QtyStepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="w-10 text-xs font-semibold text-ink-700">{label}</span>
      <div className="flex items-center rounded-lg border border-ink-200 bg-white">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="grid h-9 w-9 place-items-center text-ink-500 hover:text-ink-950" aria-label={`Retirer une taille ${label}`}><Minus size={14} /></button>
        <input
          type="number"
          min={0}
          max={500}
          value={value}
          onChange={event => {
            const next = Math.max(0, Math.min(500, Math.round(Number(event.target.value) || 0)));
            onChange(next);
          }}
          className="h-9 w-11 border-x border-ink-200 text-center text-sm tabular-nums outline-none"
          aria-label={`Quantité taille ${label}`}
        />
        <button type="button" onClick={() => onChange(Math.min(500, value + 1))} className="grid h-9 w-9 place-items-center text-ink-500 hover:text-ink-950" aria-label={`Ajouter une taille ${label}`}><Plus size={14} /></button>
      </div>
    </div>
  );
}

export function Studio({ id }: { id: string }) {
  const [product, setProduct] = useState<ProductDef | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [doc, setDoc] = useState<DesignDocument | null>(null);
  const [zoneId, setZoneId] = useState('front');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colorId, setColorId] = useState('');
  const [material, setMaterial] = useState<MaterialId>('cotton');
  const [method, setMethod] = useState<PrintMethodId>('dtf');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [view, setView] = useState<PreviewView>('face');
  const [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<'design' | 'apercu' | 'options'>('design');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<{ step: string; progress: number } | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [threeState, setThreeState] = useState<'loading' | 'ready' | 'failed'>('loading');

  const historyRef = useRef<History<DesignDocument> | null>(null);
  const sceneRef = useRef<TshirtScene | null>(null);
  const canvasesRef = useRef<Record<string, HTMLCanvasElement>>({});

  useTitle(product ? `Studio ${product.name}` : 'Studio de design');

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    api.product(id)
      .then(res => {
        if (!alive) return;
        const p = res.product;
        const initial = emptyDocumentFor(p);
        historyRef.current = new History(initial);
        setProduct(p);
        setDoc(initial);
        setZoneId(p.zones[0]?.id ?? 'front');
        setColorId(p.colors[0]?.id ?? '');
        setMaterial(p.defaultMaterial);
        setMethod(firstOrderableMethod(p) ?? p.methods[0] ?? 'dtf');
        setQuantities(defaultSizes(p));
      })
      .catch((err: Error) => { if (alive) setLoadError(err.message); });
    return () => { alive = false; };
  }, [id]);

  const zone = product?.zones.find(z => z.id === zoneId) ?? product?.zones[0] ?? null;
  const color = product?.colors.find(c => c.id === colorId) ?? product?.colors[0] ?? null;
  const selectedLayer = doc && selectedId ? findLayer(doc, zoneId, selectedId) ?? null : null;
  const imageVersion = useDesignImages(doc ?? EMPTY_DOC, urls);

  const variants = useMemo(() => (product && color ? variantsFor(product, color.id, quantities) : []), [product, color, quantities]);
  const totalQuantity = variants.reduce((sum, v) => sum + v.quantity, 0);
  const pricedZones = useMemo(() => (doc && product ? printedZones(doc, product, PRINT_METHODS[method].minDpi) : []), [doc, product, method]);

  const availability = useMemo(
    () => (product && color ? printMethodAvailability(product, material, color.hex) : []),
    [product, material, color],
  );

  const commit = useCallback((next: DesignDocument, key?: string) => {
    const history = historyRef.current;
    if (!history) return;
    history.commit(next, key);
    setDoc(history.present);
  }, []);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (!history) return;
    setDoc(history.undo());
    setSelectedId(null);
  }, []);

  const redo = useCallback(() => {
    const history = historyRef.current;
    if (!history) return;
    setDoc(history.redo());
    setSelectedId(null);
  }, []);

  const reset = useCallback(() => {
    if (!product) return;
    if (Object.values(doc?.zones ?? {}).some(z => z.layers.length) && !window.confirm('Effacer tous les calques de ce design ?')) return;
    const initial = emptyDocumentFor(product);
    historyRef.current?.reset(initial);
    setDoc(initial);
    setSelectedId(null);
  }, [product, doc]);

  // Une méthode devenue incompatible (matière/couleur) bascule vers la première méthode réellement commandable.
  useEffect(() => {
    if (!availability.length) return;
    const current = availability.find(a => a.method === method);
    if (current?.ok && current.orderable) return;
    const next = availability.find(a => a.ok && a.orderable);
    if (next && next.method !== method) setMethod(next.method);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability]);

  // Devis : le serveur est la seule source de prix.
  useEffect(() => {
    if (!product || !doc || !color) return;
    if (!variants.length || !pricedZones.length) {
      setQuote(null);
      setQuoting(false);
      setQuoteError(!variants.length ? 'Choisissez au moins une taille et une quantité.' : 'Ajoutez un visuel dans la zone imprimable pour obtenir un prix.');
      return;
    }
    let alive = true;
    setQuoting(true);
    const timer = window.setTimeout(() => {
      api.quote({
        productId: product.id,
        printMethod: method,
        material,
        variants,
        zones: pricedZones.map(z => ({ zoneId: z.zoneId, widthMm: z.widthMm, heightMm: z.heightMm })),
      })
        .then(result => {
          if (!alive) return;
          setQuote(result);
          setQuoteError(null);
        })
        .catch((err: Error) => {
          if (!alive) return;
          setQuote(null);
          setQuoteError(err.message);
        })
        .finally(() => { if (alive) setQuoting(false); });
    }, 320);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [product, doc, color, variants, pricedZones, method, material]);

  const paintPanels = useCallback((): boolean => {
    const scene = sceneRef.current;
    if (!scene || !product || !doc) return false;
    const panels: Partial<Record<'front' | 'back', PrintPanel>> = {};
    for (const printZone of product.zones) {
      if (printZone.panel !== 'front' && printZone.panel !== 'back') continue;
      let canvas = canvasesRef.current[printZone.id];
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvasesRef.current[printZone.id] = canvas;
      }
      paintZone(canvas, printZone, doc.zones[printZone.id], PANEL_PPM, urls);
      panels[printZone.panel] = {
        canvas,
        rect: {
          uMin: -printZone.widthMm / 2,
          uMax: printZone.widthMm / 2,
          vMin: printZone.offsetTopMm,
          vMax: printZone.offsetTopMm + printZone.heightMm,
        },
      };
    }
    scene.setPrint(product, panels);
    return true;
  }, [product, doc, urls]);

  useEffect(() => {
    if (threeState === 'ready') paintPanels();
  }, [threeState, paintPanels, imageVersion]);

  // Raccourcis clavier de l'éditeur.
  useEffect(() => {
    if (!doc || !product) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if (!selectedLayer) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        commit(removeLayer(doc, zoneId, selectedLayer.id));
        setSelectedId(null);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = moves[event.key];
      if (move) {
        event.preventDefault();
        const next = constrainToZone({ ...selectedLayer, x: selectedLayer.x + move[0], y: selectedLayer.y + move[1] }, product.zones.find(z => z.id === zoneId) ?? product.zones[0]);
        commit(updateLayer(doc, zoneId, selectedLayer.id, next), `arrow:${selectedLayer.id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, product, zoneId, selectedLayer, commit, undo, redo]);

  const patchLayer = (patch: Partial<Layer> & Record<string, unknown>, key?: string) => {
    if (!doc || !product || !selectedLayer) return;
    const printZone = product.zones.find(z => z.id === zoneId) ?? product.zones[0];
    let next: Layer = { ...selectedLayer, ...patch } as Layer;
    if (['x', 'y', 'width', 'height', 'rotation'].some(k => k in patch)) next = constrainToZone(next, printZone);
    commit(updateLayer(doc, zoneId, selectedLayer.id, next), key);
  };

  const addText = () => {
    if (!doc || !product || !zone) return;
    const base = makeText('Votre texte', zone.widthMm / 2, zone.heightMm / 2, Math.min(42, Math.max(12, zone.widthMm / 6)));
    const ctx = probeContext();
    const fit = ctx ? fitTextLayer(ctx, base, true) : { width: base.width, height: base.height };
    const layer = constrainToZone({ ...base, ...fit }, zone);
    commit(addLayer(doc, zoneId, layer));
    setSelectedId(layer.id);
  };

  const addShape = (shape: ShapeKind) => {
    if (!doc || !product || !zone) return;
    const size = Math.min(140, zone.widthMm * 0.45, zone.heightMm * 0.45);
    const layer = constrainToZone(makeShape(shape, zone.widthMm / 2, zone.heightMm / 2, size), zone);
    commit(addLayer(doc, zoneId, layer));
    setSelectedId(layer.id);
  };

  const uploadImage = async (file: File) => {
    if (!doc || !product || !zone) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setActionError('Formats acceptés : PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setActionError('L’image dépasse 15 Mo.');
      return;
    }
    setUploading(true);
    setActionError(null);
    try {
      const asset = await api.uploadAsset({ kind: 'source', file, filename: file.name });
      registerAsset(asset.id, asset.url);
      setUrls(current => ({ ...current, [asset.id]: asset.url }));
      await loadImage(asset.id, asset.url);
      const maxMm = Math.min(220, zone.widthMm * 0.72, zone.heightMm * 0.6);
      const layer = constrainToZone(
        makeImage(asset.id, asset.width, asset.height, zone.widthMm / 2, zone.heightMm / 2, maxMm, file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Image'),
        zone,
      );
      commit(addLayer(doc, zoneId, layer));
      setSelectedId(layer.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Import impossible.');
    } finally {
      setUploading(false);
    }
  };

  const fitText = () => {
    if (!selectedLayer || selectedLayer.type !== 'text') return;
    const ctx = probeContext();
    if (!ctx) return;
    const fit = fitTextLayer(ctx, selectedLayer, true);
    patchLayer({ width: fit.width, height: fit.height }, 'fit');
  };

  const prepareOrder = async () => {
    if (!product || !doc || !zone || !color) return;
    setActionError(null);
    if (!variants.length) { setActionError('Sélectionnez au moins une taille avec une quantité supérieure à zéro.'); return; }
    if (!pricedZones.length) { setActionError('Ajoutez un visuel dans la zone imprimable avant de commander.'); return; }
    if (threeState !== 'ready' || !sceneRef.current) {
      setActionError('Les quatre aperçus 3D sont obligatoires pour commander. Activez WebGL ou utilisez un navigateur compatible.');
      return;
    }
    setPreparing({ step: 'Vérification des images', progress: 0.04 });
    try {
      await ensureDesignImages(doc, urls);
      for (const zoneDoc of Object.values(doc.zones)) {
        for (const layer of zoneDoc.layers) {
          if (layer.type === 'image' && !peekImage(layer.assetId)) {
            throw new Error(`L’image « ${layer.name} » n’a pas pu être chargée. Réimportez-la avant de commander.`);
          }
        }
      }

      setPreparing({ step: 'Enregistrement du design', progress: 0.1 });
      const saved = await api.saveDesign(product.id, doc);
      if (Object.keys(saved.assetUrls).length) {
        setUrls(current => ({ ...current, ...saved.assetUrls }));
        for (const [assetId, url] of Object.entries(saved.assetUrls)) {
          registerAsset(assetId, url);
          await loadImage(assetId, url);
        }
      }

      if (!paintPanels()) throw new Error('La scène 3D n’est pas disponible.');
      setPreparing({ step: 'Rendu des quatre aperçus', progress: 0.24 });
      const blobs = await sceneRef.current.capture(PREVIEW_VIEWS, 1600, 2000);

      const previews = {} as Record<PreviewView, { assetId: string; url: string }>;
      let done = 0;
      for (const previewView of PREVIEW_VIEWS) {
        setPreparing({ step: `Envoi de l’aperçu ${PREVIEW_LABELS[previewView]}`, progress: 0.3 + (done / PREVIEW_VIEWS.length) * 0.32 });
        const asset = await api.uploadAsset({
          kind: 'preview',
          file: blobs[previewView],
          filename: `apercu-${previewView}.png`,
          view: previewView,
          designId: saved.id,
        });
        previews[previewView] = { assetId: asset.id, url: asset.url };
        done += 1;
      }

      const zones = printedZones(doc, product, PRINT_METHODS[method].minDpi);
      const production: {
        zoneId: string; assetId: string; widthMm: number; heightMm: number; widthPx: number; heightPx: number; dpi: number;
      }[] = [];
      let zoneDone = 0;
      for (const printed of zones) {
        setPreparing({ step: `Fichier de production : ${printed.label}`, progress: 0.64 + (zoneDone / zones.length) * 0.3 });
        const rendered = await renderProductionPng(doc, product, printed, urls, printed.dpi);
        const asset = await api.uploadAsset({
          kind: 'production',
          file: rendered.blob,
          filename: `production-${printed.zoneId}.png`,
          zoneId: printed.zoneId,
          widthMm: printed.widthMm,
          heightMm: printed.heightMm,
          dpi: printed.dpi,
          designId: saved.id,
        });
        production.push({
          zoneId: printed.zoneId,
          assetId: asset.id,
          widthMm: printed.widthMm,
          heightMm: printed.heightMm,
          widthPx: rendered.width,
          heightPx: rendered.height,
          dpi: printed.dpi,
        });
        zoneDone += 1;
      }

      setPreparing({ step: 'Nouveau devis serveur', progress: 0.97 });
      const fresh = await api.quote({
        productId: product.id,
        printMethod: method,
        material,
        variants,
        zones: zones.map(z => ({ zoneId: z.zoneId, widthMm: z.widthMm, heightMm: z.heightMm })),
      });

      saveDraft({
        productId: product.id,
        productName: product.name,
        productModel: product.model,
        printMethod: method,
        material,
        previewColorId: color.id,
        colorName: color.name,
        colorHex: color.hex,
        variants,
        zones,
        designId: saved.id,
        previews,
        production,
        quotedTotalCents: fresh.totalCents,
        quotedUnitCents: fresh.unitPriceCents,
        createdAt: new Date().toISOString(),
      });
      setPreparing({ step: 'Commande prête', progress: 1 });
      navigate('/commande');
    } catch (err) {
      setPreparing(null);
      setActionError(err instanceof Error ? err.message : 'La préparation de la commande a échoué.');
    }
  };

  if (loadError) {
    return (
      <Container className="py-16">
        <Notice tone="danger" title="Studio indisponible">{loadError}</Notice>
        <div className="mt-5"><Link to="/"><Button variant="secondary">Retour à l’accueil</Button></Link></div>
      </Container>
    );
  }

  if (!product || !doc || !zone) {
    return <Container className="py-24"><Spinner label="Chargement du studio…" /></Container>;
  }

  const orderableMethods = availability.filter(item => item.orderable && item.ok);
  const busy = Boolean(preparing) || uploading || quoting;
  const totalLabel = quote ? formatMoney(quote.totalCents) : '—';
  const unitLabel = quote ? formatMoney(quote.unitPriceCents) : '—';

  const layersPanel = (
    <LayerPanel
      layers={doc.zones[zoneId]?.layers ?? []}
      selectedId={selectedId}
      uploading={uploading}
      onSelect={setSelectedId}
      onToggleVisible={layer => commit(updateLayer(doc, zoneId, layer.id, { visible: !layer.visible }))}
      onToggleLock={layer => commit(updateLayer(doc, zoneId, layer.id, { locked: !layer.locked }))}
      onMove={(layerId, to) => commit(reorderLayer(doc, zoneId, layerId, to))}
      onDuplicate={layerId => {
        const result = duplicateLayer(doc, zoneId, layerId);
        commit(result.doc);
        if (result.newId) setSelectedId(result.newId);
      }}
      onRemove={layerId => {
        commit(removeLayer(doc, zoneId, layerId));
        setSelectedId(null);
      }}
      onAddText={addText}
      onAddShape={addShape}
      onUpload={file => void uploadImage(file)}
    />
  );

  const inspectorPanel = (
    <Inspector
      layer={selectedLayer}
      onPatch={patchLayer}
      onFitText={fitText}
      onMove={to => selectedLayer ? commit(reorderLayer(doc, zoneId, selectedLayer.id, to)) : undefined}
    />
  );

  const viewer = (
    <ShirtViewer
      color={color?.hex ?? '#f5f5f2'}
      view={view}
      onViewChange={setView}
      onScene={scene => {
        sceneRef.current = scene;
        setThreeState(scene ? 'ready' : 'failed');
        if (scene) window.setTimeout(() => paintPanels(), 0);
      }}
      onError={() => setThreeState('failed')}
      className="aspect-[4/5] w-full"
      hint
    />
  );

  const optionsPanel = (
    <div className="space-y-3">
      <OptionSection title="Coloris" hint={`${product.colors.length} coloris`}>
        <div className="flex flex-wrap gap-2">
          {product.colors.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setColorId(c.id)}
              title={c.name}
              aria-label={c.name}
              aria-pressed={c.id === colorId}
              className={cn('grid h-8 w-8 place-items-center rounded-full border-2 transition', c.id === colorId ? 'border-ink-950 ring-2 ring-ink-950/10' : 'border-white shadow-[0_0_0_1px_rgba(10,13,20,0.18)] hover:scale-105')}
              style={{ backgroundColor: c.hex }}
            >
              {c.id === colorId ? <Check size={12} className={c.hex.toLowerCase() > '#999999' ? 'text-ink-950' : 'text-white'} /> : null}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-400">{color?.name} · l’impression reste identique quelle que soit la couleur.</p>
      </OptionSection>

      <OptionSection title="Matière">
        <div className="flex flex-wrap gap-1.5">
          {product.materials.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMaterial(m)}
              aria-pressed={material === m}
              className={cn('min-h-9 rounded-full border px-3 text-[11px] font-semibold transition', material === m ? 'border-ink-950 bg-ink-950 text-paper' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-950')}
            >
              {MATERIAL_LABELS[m]}
            </button>
          ))}
        </div>
      </OptionSection>

      <OptionSection title="Méthode d’impression" hint="Devis serveur">
        <div className="space-y-1.5">
          {availability.map(item => {
            const info = PRINT_METHODS[item.method];
            const selectable = item.ok && item.orderable;
            return (
              <button
                key={item.method}
                type="button"
                disabled={!selectable}
                onClick={() => setMethod(item.method)}
                className={cn(
                  'w-full rounded-xl border px-3 py-2.5 text-left transition',
                  method === item.method && selectable ? 'border-cobalt bg-cobalt-soft/60' : 'border-ink-200 bg-white',
                  selectable ? 'hover:border-ink-950' : 'cursor-not-allowed opacity-55',
                )}
              >
                <span className="flex items-center justify-between gap-2 text-xs font-semibold">
                  {info.name}
                  {selectable ? <Badge tone="mint">OK</Badge> : <Badge tone="neutral">Indispo.</Badge>}
                </span>
                {!item.ok ? <span className="mt-1 block text-[10px] leading-relaxed text-ink-500">{item.reason}</span> : null}
                {item.ok && !item.orderable ? <span className="mt-1 block text-[10px] leading-relaxed text-ink-500">{item.statusNote}</span> : null}
              </button>
            );
          })}
        </div>
      </OptionSection>

      <OptionSection title="Tailles & quantités" hint={`${totalQuantity} pièce${totalQuantity > 1 ? 's' : ''}`}>
        <div className="space-y-1.5">
          {(product.sizes.length ? product.sizes : ['default']).map(size => (
            <QtyStepper
              key={size}
              label={product.sizes.length ? size : 'Unique'}
              value={quantities[size] ?? 0}
              onChange={value => setQuantities(current => ({ ...current, [size]: value }))}
            />
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-ink-400">Remise automatique dès 6 pièces. Une seule couleur par commande en v1.</p>
      </OptionSection>

      {orderableMethods.length ? null : (
        <Notice tone="warning" title="Aucune méthode commandable">
          Cette combinaison de matière et de couleur ne permet pas d’impression. Changez de matière ou de coloris.
        </Notice>
      )}
    </div>
  );

  const pricePanel = (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-soft">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Total TTC · {totalQuantity} pièce{totalQuantity > 1 ? 's' : ''}</p>
          <p className="font-display text-3xl leading-tight">{totalLabel}</p>
          <p className="text-[11px] text-ink-400">{quote ? `${unitLabel} l’unité · calcul serveur` : 'en attente du devis'}</p>
        </div>
        {quoting ? <Loader2 size={18} className="animate-spin text-ink-400" /> : null}
      </div>

      {quoteError ? <div className="mt-3"><Notice tone="warning">{quoteError}</Notice></div> : null}
      {quote ? (
        <div className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-[11px]">
          {quote.breakdown.map(line => (
            <div key={line.label} className="flex justify-between gap-3 text-ink-500">
              <span className="truncate">{line.label}</span>
              <span className={cn('shrink-0 tabular-nums', line.amountCents < 0 && 'text-mint')}>{formatMoney(line.amountCents)}</span>
            </div>
          ))}
          {quote.warnings.map(warning => <p key={warning} className="pt-1 text-ink-400">{warning}</p>)}
        </div>
      ) : null}

      <Button className="mt-4" block size="lg" disabled={busy || !quote || Boolean(quoteError) || threeState === 'failed'} onClick={() => void prepareOrder()}>
        {preparing ? <><Loader2 size={18} className="animate-spin" /> Préparation…</> : <>Passer la commande <ShoppingBag size={18} /></>}
      </Button>
      <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-400">
        Quatre aperçus et un PNG de production par zone sont générés avant la commande. Paiement en ligne non activé.
      </p>
    </div>
  );

  const canvasBlock = (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-ink-200 bg-paper-deep/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 bg-paper/90 px-3 py-2">
        <div className="flex gap-1">
          {product.zones.map(printZone => {
            const count = doc.zones[printZone.id]?.layers.length ?? 0;
            return (
              <button
                key={printZone.id}
                type="button"
                onClick={() => { setZoneId(printZone.id); setSelectedId(null); }}
                className={cn('min-h-9 rounded-full px-3 text-xs font-semibold transition', zoneId === printZone.id ? 'bg-ink-950 text-paper' : 'text-ink-500 hover:bg-white hover:text-ink-950')}
              >
                {printZone.label}{count ? <span className="ml-1.5 text-[10px] opacity-70">{count}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={undo} disabled={!historyRef.current?.canUndo} title="Annuler (Ctrl+Z)" className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-white hover:text-ink-950 disabled:opacity-30"><Undo2 size={16} /></button>
          <button type="button" onClick={redo} disabled={!historyRef.current?.canRedo} title="Rétablir (Ctrl+Maj+Z)" className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-white hover:text-ink-950 disabled:opacity-30"><Redo2 size={16} /></button>
          <span className="mx-1 h-5 w-px bg-ink-200" />
          <button type="button" onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))} title="Réduire" className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-white hover:text-ink-950"><ZoomOut size={16} /></button>
          <button type="button" onClick={() => setZoom(1)} title="Ajuster" className="min-h-9 min-w-12 rounded-lg px-1 text-[11px] font-semibold tabular-nums text-ink-500 hover:bg-white hover:text-ink-950">{Math.round(zoom * 100)} %</button>
          <button type="button" onClick={() => setZoom(z => Math.min(2.5, Math.round((z + 0.15) * 100) / 100))} title="Agrandir" className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-white hover:text-ink-950"><ZoomIn size={16} /></button>
          <span className="mx-1 h-5 w-px bg-ink-200" />
          <button type="button" onClick={reset} title="Nouveau design" className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-white hover:text-ink-950"><RotateCcw size={16} /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <div className="flex gap-1.5 xl:hidden">
            <button type="button" onClick={() => setLayersOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11px] font-semibold"><Layers size={14} /> Calques</button>
            <button type="button" onClick={() => setInspectorOpen(true)} disabled={!selectedLayer} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[11px] font-semibold disabled:opacity-40"><SlidersHorizontal size={14} /> Réglages</button>
          </div>
          <p className="hidden text-[10px] font-medium text-ink-400 xl:block">
            {selectedLayer ? `${selectedLayer.name} · ${Math.round(selectedLayer.width)} × ${Math.round(selectedLayer.height)} mm` : 'Glissez les calques · poignées pour redimensionner · cercle au-dessus pour tourner'}
          </p>
        </div>
        <div className="flex min-h-[380px] flex-1 xl:h-[calc(100dvh-260px)] xl:max-h-[820px] xl:min-h-[520px]">
          <StudioCanvas
            zone={zone}
            layers={doc.zones[zoneId]?.layers ?? []}
            selectedId={selectedId}
            zoom={zoom}
            urls={urls}
            onSelect={setSelectedId}
            onUpdate={(layerId, patch, key) => {
              if (!doc) return;
              const current = findLayer(doc, zoneId, layerId);
              if (!current) return;
              const merged = constrainToZone({ ...current, ...patch } as Layer, zone);
              commit(updateLayer(doc, zoneId, layerId, merged), key);
            }}
          />
        </div>
      </div>
    </section>
  );

  return (
    <Container className="py-4 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`/produit/${product.id}`} className="grid h-9 w-9 place-items-center rounded-full border border-ink-200 text-ink-500 hover:text-ink-950" aria-label="Retour au produit"><ArrowLeft size={16} /></Link>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Studio · {product.name}</p>
            <h1 className="font-display text-xl uppercase leading-none tracking-tight sm:text-2xl">Composez votre pièce</h1>
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Badge tone="cobalt">Prix serveur</Badge>
          <Badge tone="mint">PNG 300 DPI</Badge>
        </div>
      </div>

      {actionError ? (
        <div className="mb-3">
          <Notice tone="danger" title="Action impossible">{actionError}</Notice>
        </div>
      ) : null}

      <div className="mb-3 xl:hidden">
        <Segmented
          value={tab}
          onChange={setTab}
          label="Sections du studio"
          options={[
            { value: 'design', label: 'Design' },
            { value: 'apercu', label: 'Aperçu 3D' },
            { value: 'options', label: 'Options & prix' },
          ]}
        />
      </div>

      <div className="hidden gap-4 xl:grid xl:grid-cols-[250px_minmax(0,1fr)_350px]">
        <aside className="space-y-4">
          <div className="rounded-3xl border border-ink-200 bg-white/60 p-3">{layersPanel}</div>
          <div className="rounded-3xl border border-ink-200 bg-white/60 p-3">{inspectorPanel}</div>
        </aside>
        {canvasBlock}
        <aside className="space-y-4">
          {viewer}
          {optionsPanel}
          {pricePanel}
        </aside>
      </div>

      <div className="xl:hidden">
        {tab === 'design' ? <div className="pb-24">{canvasBlock}</div> : null}
        {tab === 'apercu' ? (
          <div className="space-y-4 pb-24">
            {viewer}
            <div className="rounded-2xl border border-ink-200 bg-white p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Coloris · {color?.name}</p>
              <div className="flex flex-wrap gap-2">
                {product.colors.map(c => (
                  <button key={c.id} type="button" onClick={() => setColorId(c.id)} title={c.name} aria-label={c.name} className={cn('h-8 w-8 rounded-full border-2', c.id === colorId ? 'border-ink-950 ring-2 ring-ink-950/10' : 'border-white shadow-[0_0_0_1px_rgba(10,13,20,0.18)]')} style={{ backgroundColor: c.hex }} />
                ))}
              </div>
            </div>
            <Notice tone="info">Les quatre vues fixes (face, dos, gauche, droite) sont capturées en haute résolution au moment de la commande.</Notice>
          </div>
        ) : null}
        {tab === 'options' ? <div className="space-y-4 pb-28">{optionsPanel}{pricePanel}</div> : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-paper/95 px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur xl:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-ink-400">Total TTC</p>
            <p className="truncate font-display text-xl leading-none">{totalLabel}</p>
          </div>
          <Button disabled={busy || !quote || Boolean(quoteError) || threeState === 'failed'} onClick={() => void prepareOrder()} className="shrink-0">
            {preparing ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />} Commander
          </Button>
        </div>
      </div>

      <Modal open={layersOpen} onClose={() => setLayersOpen(false)} title="Calques">
        {layersPanel}
      </Modal>
      <Modal open={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Réglages du calque">
        {inspectorPanel}
      </Modal>

      {preparing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 p-5 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-label="Préparation de la commande">
          <div className="w-full max-w-sm rounded-3xl bg-paper p-6 shadow-lift">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-cobalt-soft text-cobalt"><Loader2 size={20} className="animate-spin" /></span>
              <div>
                <p className="font-display text-lg uppercase tracking-tight">Préparation</p>
                <p className="text-xs text-ink-500">{preparing.step}</p>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink-200">
              <div className="h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${Math.max(4, Math.round(preparing.progress * 100))}%` }} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
              Le design est enregistré, puis les quatre aperçus et les PNG de production sont envoyés. Ne fermez pas cette page.
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setPreparing(null)}>Masquer</Button>
            </div>
          </div>
        </div>
      ) : null}
    </Container>
  );
}
