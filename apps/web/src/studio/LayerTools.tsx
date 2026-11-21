import { useRef } from 'react';
import {
  ChevronDown, ChevronUp, Circle, Copy, Eye, EyeOff, ImagePlus, Layers, Lock, Minus, MoveUpRight,
  Square, Star, Trash2, Triangle, Type, Unlock,
} from 'lucide-react';
import type { Layer, ShapeKind, TextLayer } from '@dprinting/core';
import { cn } from '../components/ui';

const FONTS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Archivo Black', label: 'Archivo Black' },
  { value: 'Bebas Neue', label: 'Bebas Neue' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'Georgia', label: 'Georgia' },
];

const SWATCHES = ['#11151f', '#ffffff', '#f2c14e', '#2f4bd8', '#c83535', '#1f9d76', '#6a3fa0', '#e8731c', '#9aa0a6', '#d8c7a3'];

type ListProps = {
  layers: Layer[];
  selectedId: string | null;
  uploading: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (layer: Layer) => void;
  onToggleLock: (layer: Layer) => void;
  onMove: (id: string, to: 'up' | 'down') => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAddText: () => void;
  onAddShape: (shape: ShapeKind) => void;
  onUpload: (file: File) => void;
};

export function LayerPanel(props: ListProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const ordered = [...props.layers].reverse();

  return (
    <div className="flex min-h-0 flex-col">
      <div className="grid grid-cols-4 gap-1.5">
        <ToolButton label="Texte" onClick={props.onAddText}><Type size={17} /></ToolButton>
        <ToolButton label="Rectangle" onClick={() => props.onAddShape('rect')}><Square size={17} /></ToolButton>
        <ToolButton label="Ellipse" onClick={() => props.onAddShape('ellipse')}><Circle size={17} /></ToolButton>
        <ToolButton label="Étoile" onClick={() => props.onAddShape('star')}><Star size={17} /></ToolButton>
        <ToolButton label="Triangle" onClick={() => props.onAddShape('triangle')}><Triangle size={17} /></ToolButton>
        <ToolButton label="Ligne" onClick={() => props.onAddShape('line')}><Minus size={17} /></ToolButton>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={props.uploading}
          className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 bg-white text-xs font-semibold text-ink-700 transition hover:border-ink-950 disabled:opacity-50"
        >
          <ImagePlus size={17} /> {props.uploading ? 'Envoi…' : 'Image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) props.onUpload(file);
            event.target.value = '';
          }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400"><Layers size={13} /> Calques</p>
        <span className="text-[10px] text-ink-400">{props.layers.length}</span>
      </div>

      <ul className="mt-2 space-y-1.5 overflow-y-auto pr-1 dp-scroll">
        {!ordered.length ? (
          <li className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-xs text-ink-400">
            Ajoutez un texte, une forme ou une image.
          </li>
        ) : null}
        {ordered.map(layer => {
          const selected = layer.id === props.selectedId;
          return (
            <li key={layer.id}>
              <div className={cn('group flex items-center gap-1 rounded-xl border px-1.5 py-1 transition', selected ? 'border-cobalt bg-cobalt-soft/60' : 'border-ink-200 bg-white/70 hover:border-ink-300')}>
                <button
                  type="button"
                  onClick={() => props.onSelect(layer.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-left"
                >
                  <LayerGlyph layer={layer} />
                  <span className={cn('truncate text-xs font-medium', !layer.visible && 'text-ink-400 line-through')}>{layer.name || 'Calque'}</span>
                </button>
                <IconAction label={layer.visible ? 'Masquer' : 'Afficher'} onClick={() => props.onToggleVisible(layer)}>
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </IconAction>
                <IconAction label={layer.locked ? 'Déverrouiller' : 'Verrouiller'} onClick={() => props.onToggleLock(layer)}>
                  {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                </IconAction>
                <div className="hidden flex-col sm:flex">
                  <IconAction label="Monter" onClick={() => props.onMove(layer.id, 'up')}><ChevronUp size={13} /></IconAction>
                  <IconAction label="Descendre" onClick={() => props.onMove(layer.id, 'down')}><ChevronDown size={13} /></IconAction>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {props.selectedId ? (
        <div className="mt-3 flex gap-1.5">
          <button type="button" onClick={() => props.onDuplicate(props.selectedId!)} className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white text-[11px] font-semibold hover:border-ink-950">
            <Copy size={13} /> Dupliquer
          </button>
          <button type="button" onClick={() => props.onRemove(props.selectedId!)} className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/30 bg-danger/5 text-[11px] font-semibold text-danger hover:bg-danger/10">
            <Trash2 size={13} /> Supprimer
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-ink-200 bg-white text-ink-700 transition hover:border-ink-950 hover:text-ink-950"
    >
      {children}
      <span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="grid h-8 w-7 place-items-center rounded-lg text-ink-400 hover:bg-white hover:text-ink-950">
      {children}
    </button>
  );
}

function LayerGlyph({ layer }: { layer: Layer }) {
  if (layer.type === 'text') return <Type size={14} className="shrink-0 text-ink-500" />;
  if (layer.type === 'image') return <ImagePlus size={14} className="shrink-0 text-ink-500" />;
  if (layer.shape === 'ellipse') return <Circle size={14} className="shrink-0 text-ink-500" />;
  return <Square size={14} className="shrink-0 text-ink-500" />;
}

// ---------------------------------------------------------------------------
// Inspecteur
// ---------------------------------------------------------------------------

type InspectorProps = {
  layer: Layer | null;
  onPatch: (patch: Partial<Layer>, key?: string) => void;
  onFitText: () => void;
  onMove: (to: 'front' | 'back') => void;
};

function Num({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 10) / 10 : 0}
        min={min}
        max={max}
        step={step}
        onChange={event => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm tabular-nums outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
      />
    </label>
  );
}

export function Inspector({ layer, onPatch, onFitText, onMove }: InspectorProps) {
  if (!layer) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center">
        <MoveUpRight size={20} className="mx-auto text-ink-300" />
        <p className="mt-2 text-sm font-medium text-ink-700">Aucune sélection</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-400">Touchez un calque sur la zone imprimable ou dans la liste pour régler sa position, sa taille et son style.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">{layer.name}</p>
        <div className="flex gap-1">
          <button type="button" onClick={() => onMove('front')} className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[10px] font-semibold hover:border-ink-950">Devant</button>
          <button type="button" onClick={() => onMove('back')} className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[10px] font-semibold hover:border-ink-950">Derrière</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Num label="X (mm)" value={layer.x} step={0.5} onChange={value => onPatch({ x: value }, `x:${layer.id}`)} />
        <Num label="Y (mm)" value={layer.y} step={0.5} onChange={value => onPatch({ y: value }, `y:${layer.id}`)} />
        <Num label="Largeur" value={layer.width} min={2} step={0.5} onChange={value => onPatch({ width: value }, `w:${layer.id}`)} />
        <Num label="Hauteur" value={layer.height} min={0.5} step={0.5} onChange={value => onPatch({ height: value }, `h:${layer.id}`)} />
        <Num label="Rotation (°)" value={layer.rotation} step={1} min={-180} max={180} onChange={value => onPatch({ rotation: value }, `r:${layer.id}`)} />
        <label className="block">
          <span className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-ink-400"><span>Opacité</span><span>{Math.round(layer.opacity * 100)} %</span></span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(layer.opacity * 100)}
            onChange={event => onPatch({ opacity: Number(event.target.value) / 100 }, `o:${layer.id}`)}
            className="mt-2 w-full"
          />
        </label>
      </div>

      {layer.type === 'text' ? <TextInspector layer={layer} onPatch={onPatch} onFitText={onFitText} /> : null}
      {layer.type === 'shape' ? <ShapeInspector layer={layer} onPatch={onPatch} /> : null}
      {layer.type === 'image' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-medium">
            <input type="checkbox" checked={layer.flipX} onChange={event => onPatch({ flipX: event.target.checked })} /> Miroir horizontal
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-medium">
            <input type="checkbox" checked={layer.flipY} onChange={event => onPatch({ flipY: event.target.checked })} /> Miroir vertical
          </label>
          <p className="col-span-2 text-[11px] leading-relaxed text-ink-400">
            Image d’origine : {layer.naturalWidth} × {layer.naturalHeight} px. La résolution utile dépend de la largeur imprimée.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ColorRow({ label, value, onChange, allowNone }: { label: string; value: string | null; onChange: (value: string | null) => void; allowNone?: boolean }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map(hex => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            aria-label={`${label} ${hex}`}
            className={cn('h-6 w-6 rounded-full border', value?.toLowerCase() === hex ? 'border-ink-950 ring-2 ring-ink-950/15' : 'border-ink-200')}
            style={{ backgroundColor: hex }}
          />
        ))}
        <input
          type="color"
          value={value && value !== 'transparent' ? value : '#11151f'}
          onChange={event => onChange(event.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-ink-200 bg-white p-0.5"
          aria-label={`${label} personnalisé`}
        />
        {allowNone ? (
          <button type="button" onClick={() => onChange(null)} className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[10px] font-semibold text-ink-500 hover:border-ink-950">Aucun</button>
        ) : null}
      </div>
    </div>
  );
}

function TextInspector({ layer, onPatch, onFitText }: { layer: TextLayer; onPatch: (patch: Partial<Layer>, key?: string) => void; onFitText: () => void }) {
  return (
    <div className="space-y-3 border-t border-ink-200 pt-3">
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-400">Texte</span>
        <textarea
          value={layer.text}
          rows={3}
          onChange={event => onPatch({ text: event.target.value }, `t:${layer.id}`)}
          className="w-full resize-y rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt/15"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-400">Police</span>
          <select value={layer.fontFamily} onChange={event => onPatch({ fontFamily: event.target.value })} className="w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-xs">
            {FONTS.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-400">Graisse</span>
          <select value={layer.fontWeight} onChange={event => onPatch({ fontWeight: Number(event.target.value) })} className="w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-xs">
            {[300, 400, 500, 600, 700, 900].map(weight => <option key={weight} value={weight}>{weight}</option>)}
          </select>
        </label>
        <Num label="Corps (mm)" value={layer.fontSize} min={2} max={400} onChange={value => onPatch({ fontSize: value }, `f:${layer.id}`)} />
        <Num label="Interlettre (mm)" value={layer.letterSpacing} step={0.1} min={-10} max={20} onChange={value => onPatch({ letterSpacing: value }, `l:${layer.id}`)} />
        <Num label="Interligne" value={layer.lineHeight} step={0.05} min={0.5} max={4} onChange={value => onPatch({ lineHeight: value })} />
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-400">Alignement</span>
          <select value={layer.align} onChange={event => onPatch({ align: event.target.value as TextLayer['align'] })} className="w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-xs">
            <option value="left">Gauche</option>
            <option value="center">Centre</option>
            <option value="right">Droite</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-medium">
          <input type="checkbox" checked={layer.italic} onChange={event => onPatch({ italic: event.target.checked })} /> Italique
        </label>
        <button type="button" onClick={onFitText} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold hover:border-ink-950">Ajuster la largeur</button>
      </div>
      <ColorRow label="Couleur du texte" value={layer.fill} onChange={value => onPatch({ fill: value ?? '#11151f' })} />
    </div>
  );
}

function ShapeInspector({ layer, onPatch }: { layer: Extract<Layer, { type: 'shape' }>; onPatch: (patch: Partial<Layer>, key?: string) => void }) {
  return (
    <div className="space-y-3 border-t border-ink-200 pt-3">
      <ColorRow label="Remplissage" value={layer.fill} onChange={value => onPatch({ fill: value })} allowNone />
      <ColorRow label="Contour" value={layer.stroke} onChange={value => onPatch({ stroke: value })} allowNone />
      <div className="grid grid-cols-2 gap-2">
        <Num label="Épaisseur contour (mm)" value={layer.strokeWidth} step={0.1} min={0} max={100} onChange={value => onPatch({ strokeWidth: value }, `s:${layer.id}`)} />
        <Num label="Arrondi (mm)" value={layer.cornerRadius} step={0.5} min={0} max={500} onChange={value => onPatch({ cornerRadius: value }, `c:${layer.id}`)} />
      </div>
    </div>
  );
}
