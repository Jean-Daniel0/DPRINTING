// T-shirt 3D généré par code (aucune ressource externe). Dimensions : taille adulte M, en millimètres.
// Chaque sommet reçoit ses coordonnées « à plat » (u, v) mesurées SUR LE TISSU depuis le bas du col, comme sur le patron réel :
// 1 mm dans l'éditeur = 1 mm de tissu en 3D, quelle que soit la courbure.
import { MeshData, Vec3, add, cross, dot, gridNormals, lerp, norm, scale, smooth, sub, len } from './mesh';

export type PanelExtents = { uMin: number; uMax: number; vMin: number; vMax: number };
export type PanelMesh = MeshData & { extents: PanelExtents };
export type TshirtModel = {
  front: PanelMesh; back: PanelMesh; sleeveLeft: MeshData; sleeveRight: MeshData; collar: MeshData;
  bounds: { min: Vec3; max: Vec3 };
};
export type TshirtOptions = { columns?: number; bodyRings?: number; yokeRings?: number; folds?: boolean };

export const SPEC = {
  // [hauteur depuis l'ourlet, demi-largeur, demi-profondeur]
  profile: [[0, 252, 100], [120, 250, 104], [300, 246, 108], [440, 256, 118], [520, 252, 118], [600, 244, 108], [640, 236, 96]] as [number, number, number][],
  yShoulder: 640, yokeRise: 52, neckA: 88, neckB: 62, dropFront: 68, dropBack: 16,
  sleeve: { y: 540, x0: 205, length: 245, angleDeg: 28, r0: 74, r1: 57, depthRatio: 0.9 },
  collar: { thickness: 5, height: 8 },
};

// interpolation de Catmull-Rom sur le profil (courbe douce du corps)
function profileAt(y: number): [number, number] {
  const p = SPEC.profile;
  let k = 0;
  while (k < p.length - 2 && y > p[k + 1][0]) k++;
  const p0 = p[Math.max(0, k - 1)], p1 = p[k], p2 = p[k + 1], p3 = p[Math.min(p.length - 1, k + 2)];
  const t = Math.min(1, Math.max(0, (y - p1[0]) / (p2[0] - p1[0])));
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
}

const superEllipse = (phi: number, a: number, b: number, n: number): [number, number] => {
  const s = Math.sin(phi), c = Math.cos(phi), e = 2 / n;
  return [a * Math.sign(s) * Math.pow(Math.abs(s), e), b * Math.sign(c) * Math.pow(Math.abs(c), e)];
};

/** Plis du tissu (déplacement le long de la normale, ±6 mm) : déterministe, sans aléatoire. */
function fold(phi: number, y: number, ringT: number): number {
  const waist = 1 - 0.7 * smooth(y / 450);
  let d = 3.2 * Math.sin(7 * phi + 0.9 + 0.012 * y) * waist;
  d += 1.8 * Math.sin(13 * phi - 1.3 + 0.02 * y) * 0.6;
  d += 2.2 * Math.sin(0.018 * y + 2) * Math.cos(phi) ** 2;
  d -= 3 * Math.exp(-(((y - 460) / 40) ** 2)) * Math.sin(phi) ** 2;      // creux sous les bras
  if (ringT < 3) d += 1.4 * Math.sin(9 * phi) * (1 - ringT / 3);          // ourlet légèrement ondulé
  return d;
}

export function buildTshirt(opts: TshirtOptions = {}): TshirtModel {
  const K = Math.max(8, Math.round((opts.columns ?? 96) / 4) * 4);
  const nBody = opts.bodyRings ?? 40, nYoke = opts.yokeRings ?? 14;
  const R = nBody + nYoke; // anneaux 0..R
  const folds = opts.folds !== false;
  const rows = R + 1;
  const j0 = K / 2; // colonne du centre devant (phi = 0) ; la colonne 0 est le centre du dos
  const phiOf = (j: number) => ((j - K / 2) * 2 * Math.PI) / K;

  // --- 1) corps : grille soudée (rows × K) ---
  const P: Vec3[] = new Array(rows * K);
  for (let i = 0; i < rows; i++) {
    let y: number, a: number, b: number, n: number;
    if (i <= nBody) { y = (SPEC.yShoulder * i) / nBody; [a, b] = profileAt(y); n = lerp(2.7, 2.5, i / nBody); }
    else {
      const t = (i - nBody) / nYoke;
      const [a0, b0] = profileAt(SPEC.yShoulder);
      y = SPEC.yShoulder + SPEC.yokeRise * smooth(t);
      a = lerp(a0, SPEC.neckA, 1 - (1 - t) ** 1.6); b = lerp(b0, SPEC.neckB, t); n = lerp(2.5, 2.05, t);
    }
    const w = smooth((i - (R - 6)) / 6); // l'échancrure du col n'agit que sur les derniers anneaux
    for (let j = 0; j < K; j++) {
      const phi = phiOf(j);
      let [x, z] = superEllipse(phi, a, b, n);
      const drop = SPEC.dropFront * Math.pow(Math.max(0, Math.cos(phi)), 1.5) + SPEC.dropBack * Math.pow(Math.max(0, -Math.cos(phi)), 1.5);
      const yy = y - w * drop;
      if (folds) { const d = fold(phi, yy, i) * (1 - smooth((i - (R - 8)) / 8)); const r = Math.hypot(x, z) || 1; x += (x / r) * d; z += (z / r) * d; }
      P[i * K + j] = [x, yy, z];
    }
  }
  const N = gridNormals(P, rows, K, true, p => [p[0], 0, p[2]]);

  // --- 2) coordonnées « à plat » (mm sur le tissu) ---
  const dist = (a: Vec3, b: Vec3) => len(sub(a, b));
  const c = new Float32Array(rows * K); // abscisse curviligne sur l'anneau, depuis le centre devant, + vers x>0
  const Lf = new Float32Array(rows), Lb = new Float32Array(rows);
  for (let i = 0; i < rows; i++) {
    let s = 0; for (let j = j0; j < K; j++) { c[i * K + j] = s; s += dist(P[i * K + j], P[i * K + ((j + 1) % K)]); }
    Lf[i] = s;
    s = 0; for (let j = j0; j > 0; j--) { s += dist(P[i * K + j], P[i * K + j - 1]); c[i * K + j - 1] = -s; }
    Lb[i] = s;
  }
  const tcol = new Float32Array(rows * K); // distance sur le tissu depuis l'ourlet, le long d'une colonne
  for (let j = 0; j < K; j++) { let s = 0; for (let i = 1; i < rows; i++) { s += dist(P[i * K + j], P[(i - 1) * K + j]); tcol[i * K + j] = s; } }
  const tNeckF = tcol[R * K + j0], tNeckB = tcol[R * K + 0];

  // --- 3) panneaux devant / dos : sommets dupliqués (la couture côté sépare les deux zones d'impression) ---
  const buildPanel = (front: boolean): PanelMesh => {
    const cols: number[] = [];
    if (front) for (let j = K / 4; j <= (3 * K) / 4; j++) cols.push(j);
    else { for (let j = (3 * K) / 4; j < K; j++) cols.push(j); for (let j = 0; j <= K / 4; j++) cols.push(j); }
    const pos: number[] = [], nor: number[] = [], U: number[] = [], V: number[] = [], f2: number[] = [];
    for (let i = 0; i < rows; i++) cols.forEach(j => {
      const vi = i * K + j;
      const p = P[vi], n = N[vi];
      pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]);
      let u: number;
      if (front) u = c[vi];
      else u = c[vi] > 0 || j === K - 1 ? c[vi] - Lf[i] : c[vi] + Lb[i];
      if (!front && j === 0) u = 0;
      const v = (front ? tNeckF : tNeckB) - tcol[vi];
      U.push(u); V.push(v); f2.push(u / 50, v / 50);
    });
    const W = cols.length;
    const index: number[] = [];
    for (let i = 0; i < rows - 1; i++) for (let q = 0; q < W - 1; q++) {
      const a = i * W + q, b = i * W + q + 1, d = (i + 1) * W + q, e = (i + 1) * W + q + 1;
      const tri = (x: number, y: number, z: number) => {
        const pa: Vec3 = [pos[x * 3], pos[x * 3 + 1], pos[x * 3 + 2]], pb: Vec3 = [pos[y * 3], pos[y * 3 + 1], pos[y * 3 + 2]], pc: Vec3 = [pos[z * 3], pos[z * 3 + 1], pos[z * 3 + 2]];
        const g = cross(sub(pb, pa), sub(pc, pa));
        const out: Vec3 = [(pa[0] + pb[0] + pc[0]) / 3, 0, (pa[2] + pb[2] + pc[2]) / 3];
        if (dot(g, out) >= 0) index.push(x, y, z); else index.push(x, z, y);
      };
      tri(a, d, b); tri(b, d, e);
    }
    const ext = { uMin: Math.min(...U), uMax: Math.max(...U), vMin: Math.min(...V), vMax: Math.max(...V) };
    const uvs = new Float32Array(U.length * 2);
    for (let k = 0; k < U.length; k++) { uvs[k * 2] = (U[k] - ext.uMin) / (ext.uMax - ext.uMin); uvs[k * 2 + 1] = 1 - (V[k] - ext.vMin) / (ext.vMax - ext.vMin); }
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), uvs, uvs2: new Float32Array(f2), indices: new Uint32Array(index), extents: ext };
  };
  const front = buildPanel(true), back = buildPanel(false);

  // --- 4) manches : tubes elliptiques qui sortent du corps (la jonction forme la couture d'emmanchure) ---
  const buildSleeve = (side: 1 | -1): MeshData => {
    const S = SPEC.sleeve, ang = (S.angleDeg * Math.PI) / 180;
    const dir: Vec3 = [side * Math.cos(ang), -Math.sin(ang), 0];
    const p0: Vec3 = [side * S.x0, S.y, 0];
    const zAx: Vec3 = [0, 0, 1], vAx = norm(cross(dir, zAx));
    const nr = 26, nc = 40;
    const Q: Vec3[] = [];
    for (let i = 0; i <= nr; i++) {
      const s = (i / nr) * S.length, tt = i / nr;
      const r = lerp(S.r0, S.r1, smooth(tt * 1.1));
      for (let j = 0; j < nc; j++) {
        const th = (j / nc) * Math.PI * 2;
        let rr = r; if (folds) rr += 2.2 * Math.sin(5 * th + 0.07 * s + (side > 0 ? 0 : 1.7)) * (0.4 + 0.6 * tt);
        const center = add(p0, scale(dir, s));
        Q.push(add(add(center, scale(zAx, rr * S.depthRatio * Math.cos(th))), scale(vAx, rr * Math.sin(th))));
      }
    }
    const NN = gridNormals(Q, nr + 1, nc, true, (p) => { const t = dot(sub(p, p0), dir); return sub(p, add(p0, scale(dir, t))); });
    const pos = new Float32Array(Q.length * 3), nor = new Float32Array(Q.length * 3), f2 = new Float32Array(Q.length * 2);
    Q.forEach((p, k) => { pos.set(p, k * 3); nor.set(NN[k], k * 3); const i = Math.floor(k / nc), j = k % nc; f2[k * 2] = ((j / nc) * Math.PI * 2 * lerp(S.r0, S.r1, i / nr)) / 50; f2[k * 2 + 1] = ((i / nr) * S.length) / 50; });
    const index: number[] = [];
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
      const a = i * nc + j, b = i * nc + ((j + 1) % nc), d = (i + 1) * nc + j, e = (i + 1) * nc + ((j + 1) % nc);
      for (const [x, y, z] of [[a, d, b], [b, d, e]]) {
        const g = cross(sub(Q[y], Q[x]), sub(Q[z], Q[x]));
        const cen = scale(add(add(Q[x], Q[y]), Q[z]), 1 / 3);
        const t = dot(sub(cen, p0), dir), outv = sub(cen, add(p0, scale(dir, t)));
        if (dot(g, outv) >= 0) index.push(x, y, z); else index.push(x, z, y);
      }
    }
    return { positions: pos, normals: nor, uvs: new Float32Array(Q.length * 2).fill(0.5), uvs2: f2, indices: new Uint32Array(index) };
  };

  // --- 5) col : tube aplati qui suit le bord de l'échancrure ---
  const buildCollar = (): MeshData => {
    const path: Vec3[] = []; for (let j = 0; j < K; j++) path.push(P[R * K + j]);
    const cx = path.reduce((s, p) => s + p[0], 0) / K, cz = path.reduce((s, p) => s + p[2], 0) / K;
    const ns = 12, Q: Vec3[] = [];
    for (let j = 0; j < K; j++) {
      const T = norm(sub(path[(j + 1) % K], path[(j + K - 1) % K]));
      const e1 = norm([path[j][0] - cx, 0, path[j][2] - cz]);
      let e2 = sub([0, 1, 0], scale(T, T[1])); e2 = norm(e2);
      for (let s = 0; s < ns; s++) { const th = (s / ns) * Math.PI * 2; Q.push(add(add(path[j], scale(e1, SPEC.collar.thickness * Math.cos(th))), scale(e2, SPEC.collar.height * Math.sin(th)))); }
    }
    const NN = gridNormals(Q, K, ns, true, (p, k) => { const j = Math.floor(k / ns); return sub(p, path[j]); });
    // gridNormals travaille (anneaux × colonnes) : ici la grille est (K positions × ns sommets de section)
    const pos = new Float32Array(Q.length * 3), nor = new Float32Array(Q.length * 3), f2 = new Float32Array(Q.length * 2);
    Q.forEach((p, k) => { pos.set(p, k * 3); nor.set(NN[k], k * 3); f2[k * 2] = (Math.floor(k / ns) * 4) / 50; f2[k * 2 + 1] = (k % ns) / 20; });
    const index: number[] = [];
    for (let j = 0; j < K; j++) for (let s = 0; s < ns; s++) {
      const a = j * ns + s, b = j * ns + ((s + 1) % ns), d = ((j + 1) % K) * ns + s, e = ((j + 1) % K) * ns + ((s + 1) % ns);
      for (const [x, y, z] of [[a, d, b], [b, d, e]]) {
        const g = cross(sub(Q[y], Q[x]), sub(Q[z], Q[x])), jj = Math.floor(x / ns);
        const cen = scale(add(add(Q[x], Q[y]), Q[z]), 1 / 3);
        if (dot(g, sub(cen, path[jj])) >= 0) index.push(x, y, z); else index.push(x, z, y);
      }
    }
    return { positions: pos, normals: nor, uvs: new Float32Array(Q.length * 2).fill(0.5), uvs2: f2, indices: new Uint32Array(index) };
  };

  const sleeveLeft = buildSleeve(1), sleeveRight = buildSleeve(-1), collar = buildCollar();
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const m of [front, back, sleeveLeft, sleeveRight, collar]) for (let k = 0; k < m.positions.length; k += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], m.positions[k + a]); max[a] = Math.max(max[a], m.positions[k + a]); }
  return { front, back, sleeveLeft, sleeveRight, collar, bounds: { min, max } };
}
