// Rendu 2D UNIQUE d'une zone d'impression. Il sert à l'éditeur (affichage), à la texture 3D et aux fichiers de production :
// c'est la garantie qu'il n'y a aucun décalage entre ce que voit le client, la 3D et ce qui sera imprimé.
import { ImageLayer, Layer, ShapeLayer, TextLayer } from './document';
import { degToRad } from './units';

export type AssetProvider = (assetId: string) => CanvasImageSource | null;
/** Résolution de référence pour la mise en page du texte : les retours à la ligne sont identiques à toutes les échelles. */
export const TEXT_REF_PPM = 10;

const fontString = (l: TextLayer, scalePxPerMm: number): string =>
  `${l.italic ? 'italic ' : ''}${l.fontWeight} ${Math.max(1, l.fontSize * scalePxPerMm)}px "${l.fontFamily}", "Inter", Arial, sans-serif`;

export type TextLayout = { lines: string[]; lineHeightMm: number; heightMm: number; widestMm: number };

/** Découpe le texte en lignes dans la largeur du calque (mots, puis caractères si un mot est trop long). */
export function layoutText(ctx: CanvasRenderingContext2D, l: TextLayer): TextLayout {
  ctx.save();
  ctx.font = fontString(l, TEXT_REF_PPM);
  try { (ctx as any).letterSpacing = `${l.letterSpacing * TEXT_REF_PPM}px`; } catch { /* non supporté */ }
  const maxPx = Math.max(1, l.width * TEXT_REF_PPM);
  const w = (s: string) => ctx.measureText(s).width;
  const lines: string[] = [];
  for (const para of l.text.split('\n')) {
    const words = para.split(/(\s+)/).filter(x => x.length);
    let cur = '';
    for (const word of words) {
      const test = cur + word;
      if (w(test.trimEnd()) <= maxPx || cur === '') {
        if (w(word.trim()) > maxPx && word.trim().length > 1) { // mot plus large que la boîte : coupe par caractères
          let chunk = cur;
          for (const ch of word) { if (w(chunk + ch) > maxPx && chunk) { lines.push(chunk.trimEnd()); chunk = ''; } chunk += ch; }
          cur = chunk;
        } else cur = test;
      } else { lines.push(cur.trimEnd()); cur = word.trimStart(); }
    }
    lines.push(cur.trimEnd());
  }
  let widest = 0;
  for (const ln of lines) widest = Math.max(widest, w(ln));
  ctx.restore();
  const lineHeightMm = l.fontSize * l.lineHeight;
  return { lines, lineHeightMm, heightMm: Math.max(l.fontSize, lines.length * lineHeightMm), widestMm: widest / TEXT_REF_PPM };
}

/** Taille « naturelle » d'un texte : à appeler après chaque modification du texte pour que la boîte colle au contenu. */
export function fitTextLayer(ctx: CanvasRenderingContext2D, l: TextLayer, autoWidth: boolean): { width: number; height: number } {
  let width = l.width;
  if (autoWidth) {
    const probe = layoutText(ctx, { ...l, width: 100000 });
    width = Math.max(4, probe.widestMm + l.fontSize * 0.1);
  }
  const lay = layoutText(ctx, { ...l, width });
  return { width, height: lay.heightMm };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y); ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr); ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h); ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr); ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function drawShape(ctx: CanvasRenderingContext2D, l: ShapeLayer, ppm: number) {
  const w = l.width * ppm, h = l.height * ppm;
  ctx.beginPath();
  if (l.shape === 'rect') roundRectPath(ctx, -w / 2, -h / 2, w, h, l.cornerRadius * ppm);
  else if (l.shape === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (l.shape === 'triangle') { ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); }
  else if (l.shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 1 : 0.382, a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = Math.cos(a) * r * (w / 2), py = Math.sin(a) * r * (h / 2);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else { ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); }
  if (l.fill && l.shape !== 'line') { ctx.fillStyle = l.fill; ctx.fill(); }
  if (l.stroke && l.strokeWidth > 0) { ctx.strokeStyle = l.stroke; ctx.lineWidth = l.strokeWidth * ppm; ctx.lineJoin = 'round'; ctx.lineCap = l.shape === 'line' ? 'round' : 'butt'; ctx.stroke(); }
}

function drawText(ctx: CanvasRenderingContext2D, l: TextLayer, ppm: number) {
  const lay = layoutText(ctx, l);
  const k = ppm / TEXT_REF_PPM;
  ctx.save();
  ctx.scale(k, k);
  ctx.font = fontString(l, TEXT_REF_PPM);
  try { (ctx as any).letterSpacing = `${l.letterSpacing * TEXT_REF_PPM}px`; } catch { /* non supporté */ }
  ctx.fillStyle = l.fill;
  ctx.textBaseline = 'middle';
  ctx.textAlign = l.align;
  const x = l.align === 'left' ? (-l.width * TEXT_REF_PPM) / 2 : l.align === 'right' ? (l.width * TEXT_REF_PPM) / 2 : 0;
  const lh = lay.lineHeightMm * TEXT_REF_PPM;
  const top = (-lay.lines.length * lh) / 2;
  lay.lines.forEach((ln, i) => ctx.fillText(ln, x, top + (i + 0.5) * lh));
  ctx.restore();
}

function drawImageLayer(ctx: CanvasRenderingContext2D, l: ImageLayer, ppm: number, assets: AssetProvider) {
  const img = assets(l.assetId);
  if (!img) return;
  ctx.save();
  ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
  ctx.imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = 'high';
  ctx.drawImage(img, (-l.width * ppm) / 2, (-l.height * ppm) / 2, l.width * ppm, l.height * ppm);
  ctx.restore();
}

/** Dessine les calques (du dessous vers le dessus) sur un contexte dont l'origine est le coin haut-gauche de la zone. */
export function renderLayers(ctx: CanvasRenderingContext2D, layers: Layer[], assets: AssetProvider, ppm: number): void {
  for (const l of layers) {
    if (!l.visible || l.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, l.opacity));
    ctx.translate(l.x * ppm, l.y * ppm);
    ctx.rotate(degToRad(l.rotation));
    if (l.type === 'shape') drawShape(ctx, l, ppm);
    else if (l.type === 'text') drawText(ctx, l, ppm);
    else drawImageLayer(ctx, l, ppm, assets);
    ctx.restore();
  }
}
