import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  handlePoint, hitTest, layerBounds, layerCorners, renderLayers, resizeFromHandle, rotationFromPointer, snapLayer,
  type Guide, type Handle, type Layer, type PrintZone,
} from '@dprinting/core';
import { peekImage, useImageVersion } from '../lib/images';

type Props = {
  zone: PrintZone;
  layers: Layer[];
  selectedId: string | null;
  zoom: number;
  urls: Record<string, string>;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Layer>, key?: string) => void;
};

type DragState =
  | { mode: 'move'; id: string; start: Layer; pointer: { x: number; y: number } }
  | { mode: 'resize'; id: string; start: Layer; handle: Handle; pointer: { x: number; y: number } }
  | { mode: 'rotate'; id: string; start: Layer; pointer: { x: number; y: number } };

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function dashedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dash = 4) {
  ctx.save();
  ctx.setLineDash([dash, dash]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

export function StudioCanvas({ zone, layers, selectedId, zoom, urls, onSelect, onUpdate }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [size, setSize] = useState({ width: 640, height: 520 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const version = useImageVersion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.max(240, rect.width), height: Math.max(240, rect.height) });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Le facteur de zoom s'appuie sur la place disponible : aucune déformation, uniquement une échelle.
  const fit = Math.min((size.width - 44) / zone.widthMm, (size.height - 44) / zone.heightMm);
  const ppm = Math.max(0.25, fit * zoom);
  const cssWidth = Math.max(1, Math.round(zone.widthMm * ppm));
  const cssHeight = Math.max(1, Math.round(zone.heightMm * ppm));
  const selected = useMemo(() => layers.find(l => l.id === selectedId) ?? null, [layers, selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Fond du vêtement (le damier CSS reste visible hors de la zone utile).
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Grille millimétrique.
    ctx.save();
    for (let x = 10; x < zone.widthMm; x += 10) {
      ctx.strokeStyle = x % 50 === 0 ? 'rgba(10,13,20,0.10)' : 'rgba(10,13,20,0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(x * ppm) + 0.5, 0); ctx.lineTo(Math.round(x * ppm) + 0.5, cssHeight); ctx.stroke();
    }
    for (let y = 10; y < zone.heightMm; y += 10) {
      ctx.strokeStyle = y % 50 === 0 ? 'rgba(10,13,20,0.10)' : 'rgba(10,13,20,0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Math.round(y * ppm) + 0.5); ctx.lineTo(cssWidth, Math.round(y * ppm) + 0.5); ctx.stroke();
    }
    ctx.restore();

    // Rendu réel des calques, par le même moteur que la 3D et l'export.
    renderLayers(ctx, layers, id => peekImage(id) ?? null, ppm);

    // Marge de sécurité à 10 mm.
    ctx.strokeStyle = 'rgba(217,165,47,0.75)';
    ctx.lineWidth = 1;
    dashedRect(ctx, 10 * ppm, 10 * ppm, Math.max(0, cssWidth - 20 * ppm), Math.max(0, cssHeight - 20 * ppm), 5);

    // Guides d'alignement.
    ctx.strokeStyle = 'rgba(47,75,216,0.75)';
    ctx.lineWidth = 1;
    for (const guide of guides) {
      ctx.beginPath();
      if (guide.axis === 'x') { const x = guide.position * ppm + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, cssHeight); }
      else { const y = guide.position * ppm + 0.5; ctx.moveTo(0, y); ctx.lineTo(cssWidth, y); }
      ctx.stroke();
    }

    // Sélection.
    if (selected && !selected.locked) {
      const corners = layerCorners(selected).map(p => ({ x: p.x * ppm, y: p.y * ppm }));
      ctx.strokeStyle = '#2f4bd8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();

      const handle = 9;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2f4bd8';
      ctx.lineWidth = 1.5;
      for (const h of HANDLES) {
        const p = handlePoint(selected, h);
        ctx.beginPath();
        ctx.rect(p.x * ppm - handle / 2, p.y * ppm - handle / 2, handle, handle);
        ctx.fill();
        ctx.stroke();
      }
      // Poignée de rotation au-dessus du calque.
      const top = handlePoint(selected, 'n');
      const rx = top.x * ppm, ry = top.y * ppm - 26;
      ctx.beginPath();
      ctx.moveTo(top.x * ppm, top.y * ppm);
      ctx.lineTo(rx, ry);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx, ry, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, selected, selectedId, guides, cssWidth, cssHeight, ppm, zone.widthMm, zone.heightMm, version, urls]);

  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / ppm, y: (event.clientY - rect.top) / ppm };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = pointOf(event);
    const threshold = 12 / ppm;

    if (selected && !selected.locked) {
      const rotation = handlePoint(selected, 'n');
      if (Math.hypot(point.x - rotation.x, point.y - (rotation.y - 26 / ppm)) <= threshold) {
        dragRef.current = { mode: 'rotate', id: selected.id, start: selected, pointer: point };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      for (const h of HANDLES) {
        const hp = handlePoint(selected, h);
        if (Math.abs(point.x - hp.x) <= threshold && Math.abs(point.y - hp.y) <= threshold) {
          dragRef.current = { mode: 'resize', id: selected.id, start: selected, handle: h, pointer: point };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
      }
    }

    const hit = hitTest(layers, point.x, point.y, 2);
    onSelect(hit?.id ?? null);
    if (!hit || hit.locked) return;
    dragRef.current = { mode: 'move', id: hit.id, start: hit, pointer: point };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointOf(event);

    if (drag.mode === 'move') {
      const dx = point.x - drag.pointer.x;
      const dy = point.y - drag.pointer.y;
      let next: Layer = { ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy };
      const snap = snapLayer(next, zone, layers, 4 / ppm);
      next = { ...next, x: next.x + snap.dx, y: next.y + snap.dy };
      const b = layerBounds(next);
      let ox = 0, oy = 0;
      const width = b.maxX - b.minX, height = b.maxY - b.minY;
      if (width <= zone.widthMm) { if (b.minX < 0) ox = -b.minX; else if (b.maxX > zone.widthMm) ox = zone.widthMm - b.maxX; }
      if (height <= zone.heightMm) { if (b.minY < 0) oy = -b.minY; else if (b.maxY > zone.heightMm) oy = zone.heightMm - b.maxY; }
      setGuides(snap.guides);
      onUpdate(drag.id, { x: next.x + ox, y: next.y + oy }, `drag:${drag.id}`);
      return;
    }

    if (drag.mode === 'resize') {
      const keepAspect = event.shiftKey || (drag.start.type === 'image' && drag.handle.length === 2);
      const geometry = resizeFromHandle(drag.start, drag.handle, point, { keepAspect });
      const next = constrain({ ...drag.start, ...geometry }, zone);
      onUpdate(drag.id, { x: next.x, y: next.y, width: next.width, height: next.height }, `resize:${drag.id}`);
      return;
    }

    const angle = rotationFromPointer({ x: drag.start.x, y: drag.start.y }, point, event.shiftKey);
    const next = constrain({ ...drag.start, rotation: angle }, zone);
    onUpdate(drag.id, { x: next.x, y: next.y, rotation: next.rotation }, `rotate:${drag.id}`);
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    setGuides([]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div ref={hostRef} className="relative flex min-h-[320px] w-full flex-1 items-center justify-center overflow-auto p-4 sm:p-6">
      <div
        className="relative shrink-0 checker shadow-lift"
        style={{ width: cssWidth, height: cssHeight, touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full touch-none"
          style={{ width: cssWidth, height: cssHeight }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="img"
          aria-label={`Zone d'impression ${zone.label}, ${zone.widthMm} par ${zone.heightMm} millimètres`}
        />
        <span className="pointer-events-none absolute -top-6 left-0 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
          {zone.widthMm} × {zone.heightMm} mm
        </span>
      </div>
    </div>
  );
}

/** Empêche un calque de sortir de la zone : réduit puis recentre. */
function constrain<T extends Layer>(layer: T, zone: PrintZone): T {
  const b = layerBounds(layer);
  const width = b.maxX - b.minX, height = b.maxY - b.minY;
  const k = Math.min(1, zone.widthMm / Math.max(width, 0.001), zone.heightMm / Math.max(height, 0.001));
  let next = layer;
  if (k < 1) {
    next = { ...layer, width: Math.max(2, layer.width * k), height: Math.max(0.5, layer.height * k) };
  }
  const nb = layerBounds(next);
  let dx = 0, dy = 0;
  if (nb.minX < 0) dx = -nb.minX; else if (nb.maxX > zone.widthMm) dx = zone.widthMm - nb.maxX;
  if (nb.minY < 0) dy = -nb.minY; else if (nb.maxY > zone.heightMm) dy = zone.heightMm - nb.maxY;
  return dx || dy ? { ...next, x: next.x + dx, y: next.y + dy } : next;
}
