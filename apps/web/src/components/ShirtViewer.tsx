import { useEffect, useRef, useState } from 'react';
import type { PreviewView, ProductDef } from '@dprinting/core';
import { TshirtScene, type PrintPanel } from '../three/TshirtScene';
import { cn } from './ui';

const VIEW_BUTTONS: { view: PreviewView; label: string }[] = [
  { view: 'face', label: 'Face' },
  { view: 'back', label: 'Dos' },
  { view: 'left', label: 'Gauche' },
  { view: 'right', label: 'Droite' },
];

type Props = {
  color: string;
  product?: ProductDef;
  panels?: Partial<Record<'front' | 'back', PrintPanel>>;
  view?: PreviewView;
  onViewChange?: (view: PreviewView) => void;
  onScene?: (scene: TshirtScene | null) => void;
  onError?: () => void;
  showControls?: boolean;
  className?: string;
  hint?: boolean;
};

function ShirtFallback({ color }: { color: string }) {
  return (
    <div className="flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-4 bg-[#efece5] p-6 text-center">
      <svg viewBox="0 0 320 360" className="h-full max-h-[300px] w-auto drop-shadow-xl" role="img" aria-label="Silhouette de T-shirt">
        <path
          d="M96 34 L126 22 Q160 46 194 22 L224 34 L288 86 L250 134 L228 116 L228 330 Q160 344 92 330 L92 116 L70 134 L32 86 Z"
          fill={color}
          stroke="#0a0d14"
          strokeOpacity="0.18"
          strokeWidth="3"
        />
        <path d="M126 22 Q160 60 194 22" fill="none" stroke="#0a0d14" strokeOpacity="0.18" strokeWidth="4" />
      </svg>
      <p className="max-w-xs text-xs leading-relaxed text-ink-500">
        3D indisponible sur cet appareil (WebGL désactivé). L’éditeur 2D et les quatre aperçus restent utilisables.
      </p>
    </div>
  );
}

/**
 * Visionneuse 3D réutilisable. La scène est construite entièrement par le code du projet.
 * Les panneaux d'impression sont fournis par le studio : ils sont partagés avec l'export de production.
 */
export function ShirtViewer({ color, product, panels, view: controlledView, onViewChange, onScene, onError, showControls = true, className, hint }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TshirtScene | null>(null);
  const onSceneRef = useRef(onScene);
  onSceneRef.current = onScene;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [failed, setFailed] = useState(false);
  const [internalView, setInternalView] = useState<PreviewView>('face');
  const view = controlledView ?? internalView;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let scene: TshirtScene | null = null;
    try {
      scene = new TshirtScene(canvas, color);
      sceneRef.current = scene;
      onSceneRef.current?.(scene);
    } catch (error) {
      console.error('[dprinting] 3D indisponible', error);
      setFailed(true);
      onErrorRef.current?.();
      return;
    }
    const observer = new ResizeObserver(() => scene?.resize());
    observer.observe(host);
    const onLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
      onErrorRef.current?.();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      onSceneRef.current?.(null);
      sceneRef.current = null;
      scene?.dispose();
    };
    // La scène est créée une fois ; les propriétés sont mises à jour par les effets ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sceneRef.current?.setColor(color); }, [color]);
  useEffect(() => { sceneRef.current?.setView(view); }, [view]);
  useEffect(() => {
    if (product && panels) sceneRef.current?.setPrint(product, panels);
  }, [product, panels]);

  const changeView = (next: PreviewView) => {
    setInternalView(next);
    onViewChange?.(next);
  };

  return (
    <div className={cn('relative overflow-hidden rounded-3xl bg-[#efece5]', className)}>
      {failed ? <ShirtFallback color={color} /> : (
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="block h-full w-full touch-pan-y" aria-label="Aperçu 3D du T-shirt personnalisé" />
        </div>
      )}
      {!failed && showControls ? (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
          <div className="flex gap-1 rounded-full border border-white/60 bg-white/80 p-1 shadow-soft backdrop-blur">
            {VIEW_BUTTONS.map(button => (
              <button
                key={button.view}
                type="button"
                onClick={() => changeView(button.view)}
                aria-pressed={view === button.view}
                className={cn(
                  'min-h-8 rounded-full px-3 text-[11px] font-bold uppercase tracking-wider transition',
                  view === button.view ? 'bg-ink-950 text-paper' : 'text-ink-600 hover:text-ink-950',
                )}
              >
                {button.label}
              </button>
            ))}
          </div>
          {hint ? <p className="rounded-full bg-ink-950/55 px-2.5 py-1 text-[10px] font-medium text-white/90">Glissez pour tourner · 4 vues fixes pour la commande</p> : null}
        </div>
      ) : null}
    </div>
  );
}
