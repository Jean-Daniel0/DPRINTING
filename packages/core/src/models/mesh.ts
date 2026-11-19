export type MeshData = {
  positions: Float32Array; // x, y, z en millimètres (y vers le haut ; z vers l'avant du produit)
  normals: Float32Array;
  uvs: Float32Array;       // canal 0 : zone d'impression (normalisé 0..1 sur le panneau)
  uvs2: Float32Array;      // canal 1 : motif du tissu, en mm / 50 (uniforme sur tout le produit)
  indices: Uint32Array;
};
export type Vec3 = [number, number, number];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const smooth = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Normales lisses d'une grille (rows × cols) : différences finies sur la surface elle-même, donc sans couture visible.
 * `wrapCols` : la grille se referme sur elle-même (tube). `outward(p)` donne le sens « extérieur » pour orienter les normales.
 */
export function gridNormals(P: Vec3[], rows: number, cols: number, wrapCols: boolean, outward: (p: Vec3, idx: number) => Vec3): Vec3[] {
  const at = (i: number, j: number): Vec3 => P[Math.min(rows - 1, Math.max(0, i)) * cols + (wrapCols ? ((j % cols) + cols) % cols : Math.min(cols - 1, Math.max(0, j)))];
  const out: Vec3[] = new Array(P.length);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const dc = sub(at(i, j + 1), at(i, j - 1));
    const dr = sub(at(i + 1, j), at(i - 1, j));
    let n = norm(cross(dc, dr));
    if (dot(n, outward(at(i, j), i * cols + j)) < 0) n = scale(n, -1);
    out[i * cols + j] = n;
  }
  return out;
}
