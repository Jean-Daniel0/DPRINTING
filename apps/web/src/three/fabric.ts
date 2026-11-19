// Textures de tissu générées localement : aucune image externe, aucun asset commercial.
// Un maillage de « maille » est dessiné en niveaux de gris puis converti en carte de normales.
import * as THREE from 'three';

/** PRNG déterministe : le même tissu est produit à chaque exécution, sur toutes les machines. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type FabricMaps = {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
};

/**
 * Carte de normales d'un jersey : côtes verticales, trame horizontale et irrégularité douce.
 * La texture est répétable (bords raccordés) et exprimée en espace tangent.
 */
export function createFabricMaps(size = 256): FabricMaps {
  const rand = mulberry32(0xd9a1f3);
  const height = new Float32Array(size * size);

  // Bruit de valeur lissé, périodique (raccord sans couture).
  const lattice = 16;
  const grid = new Float32Array(lattice * lattice).map(() => rand());
  const valueNoise = (x: number, y: number): number => {
    const gx = (x / size) * lattice, gy = (y / size) * lattice;
    const x0 = Math.floor(gx) % lattice, y0 = Math.floor(gy) % lattice;
    const x1 = (x0 + 1) % lattice, y1 = (y0 + 1) % lattice;
    const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * lattice + x0], b = grid[y0 * lattice + x1];
    const c = grid[y1 * lattice + x0], d = grid[y1 * lattice + x1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };

  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / size, fy = y / size;
      // Côtes verticales (30 colonnes) + trame horizontale plus fine (60 rangées).
      const wale = Math.sin(fx * TAU * 30) * 0.5 + 0.5;
      const course = Math.sin(fy * TAU * 60) * 0.5 + 0.5;
      let h = 0.55 * wale + 0.3 * course;
      h += 0.18 * Math.sin((fx * 7 + fy * 11) * TAU);
      h += 0.35 * valueNoise(x, y);
      // Irrégularité du fil : petites bosses arrondies.
      h += 0.18 * Math.sin(fx * TAU * 3 + Math.sin(fy * TAU * 2) * 2);
      height[y * size + x] = h;
    }
  }

  // Normales par différences finies (bords raccordés), force réglable.
  const normalData = new Uint8ClampedArray(size * size * 4);
  const roughData = new Uint8ClampedArray(size * size * 4);
  const strength = 2.2;
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normalData[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      normalData[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      normalData[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      normalData[i + 3] = 255;
      // L'usure du tissu : rugosité légèrement variable.
      const r = 205 + Math.round((height[y * size + x] - 0.8) * 30);
      const v = Math.max(160, Math.min(255, r));
      roughData[i] = v; roughData[i + 1] = v; roughData[i + 2] = v; roughData[i + 3] = 255;
    }
  }

  const normalMap = new THREE.CanvasTexture(canvasFrom(normalData, size));
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.anisotropy = 4;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(canvasFrom(roughData, size));
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = 2;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

function canvasFrom(data: Uint8ClampedArray, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    img.data.set(data);
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

/**
 * Environnement d'éclairage doux (studio) construit à partir d'un dégradé, sans HDR externe.
 * Il donne aux matières leurs reflets : c'est ce qui distingue un rendu plat d'un rendu produit.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, '#f8f7f4');
    sky.addColorStop(0.45, '#dcd7cc');
    sky.addColorStop(0.62, '#b8b1a4');
    sky.addColorStop(1, '#6f6a61');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 256);
    // Deux boîtes à lumière : reflets doux et directionnels.
    const soft = (x: number, y: number, rx: number, ry: number, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
      g.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      ctx.translate(-x, -y);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    soft(150, 70, 120, 90, 0.95);
    soft(380, 90, 150, 70, 0.6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return env;
}

/** Ombre de contact : dégradé radial doux, pour asseoir le produit sans sol visible. */
export function createContactShadow(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 126);
    g.addColorStop(0, 'rgba(20,18,14,0.34)');
    g.addColorStop(0.55, 'rgba(20,18,14,0.16)');
    g.addColorStop(1, 'rgba(20,18,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
