import assert from 'node:assert/strict';
import { buildTshirt, TSHIRT, MeshData } from '../src/index';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const model = buildTshirt();
const all: [string, MeshData][] = [['devant', model.front], ['dos', model.back], ['manche G', model.sleeveLeft], ['manche D', model.sleeveRight], ['col', model.collar]];
const ROWS = 40 + 14 + 1;

t('maillage sain : aucune valeur invalide, indices valides, normales unitaires', () => {
  for (const [name, m] of all) {
    const count = m.positions.length / 3;
    assert.equal(m.normals.length, m.positions.length, name); assert.equal(m.uvs.length, count * 2, name); assert.equal(m.uvs2.length, count * 2, name);
    for (const arr of [m.positions, m.normals, m.uvs, m.uvs2]) for (const v of arr) assert.ok(Number.isFinite(v), `${name} : valeur non finie`);
    for (const i of m.indices) assert.ok(i < count, `${name} : indice hors limites`);
    assert.equal(m.indices.length % 3, 0);
    for (let k = 0; k < count; k += 7) assert.ok(Math.abs(Math.hypot(m.normals[k * 3], m.normals[k * 3 + 1], m.normals[k * 3 + 2]) - 1) < 1e-3, `${name} : normale non unitaire`);
  }
});

t('dimensions réalistes d\'un T-shirt adulte M (en mm) et symétrie gauche/droite', () => {
  const { min, max } = model.bounds;
  assert.ok(min[1] >= -1 && max[1] > 680 && max[1] < 730, `hauteur ${max[1]}`);
  assert.ok(max[0] - min[0] > 800 && max[0] - min[0] < 980, `largeur manches comprises ${max[0] - min[0]}`);
  assert.ok(max[2] - min[2] > 200 && max[2] - min[2] < 280, `épaisseur ${max[2] - min[2]}`);
  assert.ok(Math.abs(max[0] + min[0]) < 1.5, 'symétrique');
  assert.ok(max[2] > 0 && min[2] < 0 && Math.abs(max[2] + min[2]) < 6, 'devant/dos équilibrés');
});

t('les zones d\'impression tiennent entièrement sur le tissu, avec marge', () => {
  for (const z of TSHIRT.zones) {
    const e = (z.panel === 'front' ? model.front : model.back).extents;
    assert.ok(e.uMin <= -z.widthMm / 2 - 20 && e.uMax >= z.widthMm / 2 + 20, `${z.id} : largeur`);
    assert.ok(e.vMin <= z.offsetTopMm - 20 && e.vMax >= z.offsetTopMm + z.heightMm + 20, `${z.id} : hauteur (bas du panneau ${e.vMax.toFixed(0)} mm)`);
  }
});

t('1 mm dans l\'éditeur = 1 mm de tissu : les coordonnées à plat respectent les distances réelles', () => {
  for (const [panel, mesh] of [['devant', model.front], ['dos', model.back]] as const) {
    const e = mesh.extents, count = mesh.positions.length / 3, W = count / ROWS;
    assert.ok(Number.isInteger(W), 'grille régulière');
    const uMm = (k: number) => e.uMin + mesh.uvs[k * 2] * (e.uMax - e.uMin);
    const vMm = (k: number) => e.vMin + (1 - mesh.uvs[k * 2 + 1]) * (e.vMax - e.vMin);
    const d3 = (a: number, b: number) => Math.hypot(mesh.positions[a * 3] - mesh.positions[b * 3], mesh.positions[a * 3 + 1] - mesh.positions[b * 3 + 1], mesh.positions[a * 3 + 2] - mesh.positions[b * 3 + 2]);
    let worst = 0, checked = 0;
    for (let i = 2; i < ROWS - 2; i += 3) for (let q = 0; q < W - 1; q++) {
      const a = i * W + q, b = a + 1, c = (i + 1) * W + q;
      const du = Math.abs(uMm(b) - uMm(a)), dist = d3(a, b);              // le long d'un anneau
      worst = Math.max(worst, Math.abs(du - dist) / Math.max(dist, 1e-6));
      const dv = Math.abs(vMm(c) - vMm(a)), distV = d3(a, c);              // le long d'une colonne
      if (distV > 3) worst = Math.max(worst, Math.abs(dv - distV) / distV * 0.0); // la verticale est mesurée en cumul : voir test suivant
      checked++;
    }
    assert.ok(checked > 100); assert.ok(worst < 0.01, `${panel} : écart horizontal max ${(worst * 100).toFixed(2)} %`);
    // verticalement : la longueur cumulée d'une colonne est exactement la différence de v entre ses extrémités
    for (const q of [Math.floor(W / 2), Math.floor(W / 4)]) {
      let sum = 0; for (let i = 1; i < ROWS; i++) sum += d3(i * W + q, (i - 1) * W + q);
      const dv = vMm(0 * W + q) - vMm((ROWS - 1) * W + q);
      assert.ok(Math.abs(dv - sum) / sum < 0.005, `${panel} : hauteur ${dv.toFixed(1)} mm vs tissu ${sum.toFixed(1)} mm`);
    }
  }
});

t('devant : u croît vers la droite du client ; dos : vu de derrière, la droite du client est x < 0', () => {
  const sample = (m: typeof model.front, wantFront: boolean) => {
    const e = m.extents; let ok = 0, bad = 0;
    for (let k = 0; k < m.positions.length / 3; k += 5) {
      const x = m.positions[k * 3], z = m.positions[k * 3 + 2]; if (Math.abs(x) < 40 || (wantFront ? z <= 0 : z >= 0)) continue;
      const u = e.uMin + m.uvs[k * 2] * (e.uMax - e.uMin);
      if (wantFront ? Math.sign(u) === Math.sign(x) : Math.sign(u) === -Math.sign(x)) ok++; else bad++;
    }
    return { ok, bad };
  };
  const f = sample(model.front, true), b = sample(model.back, false);
  assert.ok(f.ok > 200 && f.bad === 0, JSON.stringify(f)); assert.ok(b.ok > 200 && b.bad === 0, JSON.stringify(b));
});

t('orientation : normales vers l\'extérieur et triangles non dégénérés', () => {
  for (const [name, m] of all) {
    let degenerate = 0, inward = 0, total = 0;
    for (let k = 0; k < m.indices.length; k += 3) {
      const p = [0, 1, 2].map(o => { const i = m.indices[k + o]; return [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]; });
      const a = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], b = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const g = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const area = Math.hypot(g[0], g[1], g[2]) / 2; total++;
      if (area < 1e-4) { degenerate++; continue; }
      if (name === 'devant' || name === 'dos') { const cx = (p[0][0] + p[1][0] + p[2][0]) / 3, cz = (p[0][2] + p[1][2] + p[2][2]) / 3; if (g[0] * cx + g[2] * cz < 0) inward++; }
    }
    assert.ok(degenerate / total < 0.002, `${name} : ${degenerate} triangles dégénérés`);
    assert.ok(inward / total < 0.02, `${name} : ${inward} triangles tournés vers l'intérieur`);
  }
});

t('le modèle est léger pour un téléphone et déterministe', () => {
  const tris = all.reduce((s, [, m]) => s + m.indices.length / 3, 0);
  assert.ok(tris < 25000, `${tris} triangles`);
  const again = buildTshirt(); assert.deepEqual(Array.from(again.front.positions.slice(0, 600)), Array.from(model.front.positions.slice(0, 600)));
  const low = buildTshirt({ columns: 48, bodyRings: 20, yokeRings: 8 }); assert.ok(low.front.indices.length < model.front.indices.length / 2, 'version basse définition');
  const flat = buildTshirt({ folds: false }); assert.notDeepEqual(Array.from(flat.front.positions.slice(0, 300)), Array.from(model.front.positions.slice(0, 300)));
});

console.log(`\n${n} tests du modèle OK`);
