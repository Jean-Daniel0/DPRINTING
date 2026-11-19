// Rendu logiciel (CPU) du modèle 3D pour le contrôler sans navigateur : forme, plis, grille de 50 mm, zone d'impression.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { buildTshirt } from '../packages/core/src/models/tshirt';
import { TSHIRT } from '../packages/core/src/catalog';
import type { MeshData } from '../packages/core/src/models/mesh';

type Img = { w: number; h: number; data: Uint8Array };
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b: Uint8Array) => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(img: Img): Buffer {
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) { raw[y * (img.w * 4 + 1)] = 0; Buffer.from(img.data.buffer, y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1); }
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export type Opts = { yaw: number; pitch: number; size: number; zoneRects?: boolean };
function render(model: ReturnType<typeof buildTshirt>, o: Opts): Img {
  const W = o.size, H = o.size;
  const data = new Uint8Array(W * H * 4); for (let i = 0; i < W * H; i++) { data[i * 4] = 238; data[i * 4 + 1] = 240; data[i * 4 + 2] = 244; data[i * 4 + 3] = 255; }
  const zbuf = new Float32Array(W * H).fill(-1e9);
  const { min, max } = model.bounds; const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
  const sc = (H * 0.9) / Math.max(max[1] - min[1], max[0] - min[0]);
  const ya = (o.yaw * Math.PI) / 180, pa = (o.pitch * Math.PI) / 180;
  const rot = (x: number, y: number, z: number): [number, number, number] => {
    x -= cx; y -= cy; z -= cz;
    const x1 = x * Math.cos(ya) + z * Math.sin(ya), z1 = -x * Math.sin(ya) + z * Math.cos(ya);
    const y2 = y * Math.cos(pa) - z1 * Math.sin(pa), z2 = y * Math.sin(pa) + z1 * Math.cos(pa);
    return [x1, y2, z2];
  };
  const L = [0.45, 0.6, 0.65]; const ll = Math.hypot(...L); const Ld = L.map(v => v / ll);
  const meshes: { m: MeshData; panel?: 'front' | 'back'; ext?: any; base: [number, number, number] }[] = [
    { m: model.front, panel: 'front', ext: model.front.extents, base: [150, 170, 215] }, { m: model.back, panel: 'back', ext: model.back.extents, base: [150, 170, 215] },
    { m: model.sleeveLeft, base: [150, 170, 215] }, { m: model.sleeveRight, base: [150, 170, 215] }, { m: model.collar, base: [120, 138, 190] },
  ];
  for (const { m, panel, ext, base } of meshes) {
    const n = m.positions.length / 3;
    const sp: [number, number, number][] = [], sn: [number, number, number][] = [];
    for (let k = 0; k < n; k++) {
      const p = rot(m.positions[k * 3], m.positions[k * 3 + 1], m.positions[k * 3 + 2]);
      sp.push([W / 2 + p[0] * sc, H / 2 - p[1] * sc, p[2]]);
      sn.push(rot(m.normals[k * 3] + cx, m.normals[k * 3 + 1] + cy, m.normals[k * 3 + 2] + cz));
    }
    for (let t = 0; t < m.indices.length; t += 3) {
      const ia = m.indices[t], ib = m.indices[t + 1], ic = m.indices[t + 2];
      const A = sp[ia], B = sp[ib], C = sp[ic];
      const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(den) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const l1 = ((B[1] - C[1]) * (x + 0.5 - C[0]) + (C[0] - B[0]) * (y + 0.5 - C[1])) / den;
        const l2 = ((C[1] - A[1]) * (x + 0.5 - C[0]) + (A[0] - C[0]) * (y + 0.5 - C[1])) / den;
        const l3 = 1 - l1 - l2; if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        const z = l1 * A[2] + l2 * B[2] + l3 * C[2]; if (z <= zbuf[y * W + x]) continue; zbuf[y * W + x] = z;
        const nx = l1 * sn[ia][0] + l2 * sn[ib][0] + l3 * sn[ic][0], ny = l1 * sn[ia][1] + l2 * sn[ib][1] + l3 * sn[ic][1], nz = l1 * sn[ia][2] + l2 * sn[ib][2] + l3 * sn[ic][2];
        const nl = Math.hypot(nx, ny, nz) || 1; let d = (nx * Ld[0] + ny * Ld[1] + nz * Ld[2]) / nl; const facing = nz / nl;
        let sh = facing >= 0 ? 0.35 + 0.65 * Math.max(0, d) : 0.28 + 0.2 * Math.max(0, -d);
        let col: [number, number, number] = [...base];
        if (panel && ext) {
          const u = l1 * m.uvs[ia * 2] + l2 * m.uvs[ib * 2] + l3 * m.uvs[ic * 2], v = 1 - (l1 * m.uvs[ia * 2 + 1] + l2 * m.uvs[ib * 2 + 1] + l3 * m.uvs[ic * 2 + 1]);
          const um = ext.uMin + u * (ext.uMax - ext.uMin), vm = ext.vMin + v * (ext.vMax - ext.vMin);
          const gx = Math.abs(((um % 50) + 50) % 50), gy = Math.abs(((vm % 50) + 50) % 50);
          if (gx < 0.9 || gx > 49.1 || gy < 0.9 || gy > 49.1) col = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.7];
          const z0 = TSHIRT.zones.find(zz => zz.panel === panel)!;
          const inZone = um >= -z0.widthMm / 2 && um <= z0.widthMm / 2 && vm >= z0.offsetTopMm && vm <= z0.offsetTopMm + z0.heightMm;
          if (o.zoneRects !== false && inZone) col = [col[0] * 0.6 + 255 * 0.4, col[1] * 0.6, col[2] * 0.6];
        }
        const p = (y * W + x) * 4; data[p] = Math.min(255, col[0] * sh); data[p + 1] = Math.min(255, col[1] * sh); data[p + 2] = Math.min(255, col[2] * sh);
      }
    }
  }
  return { w: W, h: H, data };
}

export function contactSheet(views: Img[]): Img {
  const w = views[0].w, h = views[0].h, cols = 2, rows = Math.ceil(views.length / cols);
  const out = new Uint8Array(w * cols * h * rows * 4);
  views.forEach((v, k) => { const ox = (k % cols) * w, oy = Math.floor(k / cols) * h; for (let y = 0; y < h; y++) out.set(v.data.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * w * cols + ox) * 4); });
  return { w: w * cols, h: h * rows, data: out };
}

const model = buildTshirt();
const tri = (m: MeshData) => m.indices.length / 3;
console.log('triangles:', tri(model.front) + tri(model.back) + tri(model.sleeveLeft) + tri(model.sleeveRight) + tri(model.collar), 'bornes:', model.bounds.min.map(Math.round), model.bounds.max.map(Math.round));
console.log('panneau devant (mm):', Object.fromEntries(Object.entries(model.front.extents).map(([k, v]) => [k, Math.round(v as number)])));
console.log('panneau dos (mm):', Object.fromEntries(Object.entries(model.back.extents).map(([k, v]) => [k, Math.round(v as number)])));
fs.mkdirSync('tools/out', { recursive: true });
const sheet = contactSheet([render(model, { yaw: 0, pitch: 0, size: 560 }), render(model, { yaw: 90, pitch: 0, size: 560 }), render(model, { yaw: 180, pitch: 0, size: 560 }), render(model, { yaw: 35, pitch: 14, size: 560 })]);
fs.writeFileSync('tools/out/tshirt.png', png(sheet));
console.log('écrit tools/out/tshirt.png');
