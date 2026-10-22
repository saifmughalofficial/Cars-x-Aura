// Procedural geometry helpers used to build the cars: superellipse lofts, keyed material bins
// and a small geometry merger (so each car is only a handful of draw calls).
import * as THREE from 'three';

/**
 * Superellipse cross-section unit coordinates for ring index k of `segs`.
 * k = 0 is the bottom centre, segs/2 the top centre.
 */
export function ringUnit(k, segs, n) {
  const a = -Math.PI / 2 + (k / segs) * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  const e = 2 / n;
  return [Math.sign(c) * Math.pow(Math.abs(c), e), Math.sign(s) * Math.pow(Math.abs(s), e)];
}

/** Half width of a station at height y (0 if outside). */
export function extentX(st, y) {
  const cy = (st.yb + st.yt) / 2, hh = (st.yt - st.yb) / 2;
  if (hh <= 0) return 0;
  const py = (y - cy) / hh;
  if (py <= -1 || py >= 1) return 0;
  const ax = Math.pow(1 - Math.pow(Math.abs(py), st.n), 1 / st.n);
  const sc = py > 0 ? 1 + ((st.ts ?? 1) - 1) * py : 1;
  return st.hw * ax * sc;
}

/** Interpolate a station list (sorted by z) at z. */
export function stationAt(stations, z) {
  if (z <= stations[0].z) return stations[0];
  const last = stations[stations.length - 1];
  if (z >= last.z) return last;
  let i = 1;
  while (stations[i].z < z) i++;
  const a = stations[i - 1], b = stations[i];
  const t = (z - a.z) / (b.z - a.z || 1);
  return {
    z, hw: a.hw + (b.hw - a.hw) * t, yb: a.yb + (b.yb - a.yb) * t, yt: a.yt + (b.yt - a.yt) * t,
    n: a.n + (b.n - a.n) * t, ts: (a.ts ?? 1) + ((b.ts ?? 1) - (a.ts ?? 1)) * t,
  };
}

/**
 * Densify key stations: union of keys and a uniform grid, linearly interpolated, then smoothed
 * (keys flagged `lock` keep sharp edges, e.g. a pickup's bed step).
 */
export function densify(keys, count, passes = 2) {
  keys = keys.slice().sort((a, b) => a.z - b.z);
  const z0 = keys[0].z, z1 = keys[keys.length - 1].z;
  const zs = keys.map((k) => k.z);
  for (let i = 1; i < count; i++) zs.push(z0 + ((z1 - z0) * i) / count);
  zs.sort((a, b) => a - b);
  const uniq = [];
  for (const z of zs) if (!uniq.length || z - uniq[uniq.length - 1] > 0.012) uniq.push(z);
  if (uniq[uniq.length - 1] < z1 - 1e-6) uniq.push(z1);
  const out = uniq.map((z) => {
    const s = stationAt(keys, z);
    const key = keys.find((k) => Math.abs(k.z - z) < 1e-6);
    return { ...s, lock: !!(key && key.lock) };
  });
  for (let p = 0; p < passes; p++) {
    const prev = out.map((s) => ({ ...s }));
    for (let i = 1; i < out.length - 1; i++) {
      if (out[i].lock || out[i - 1].lock || out[i + 1].lock) continue;
      for (const f of ['hw', 'yb', 'yt']) out[i][f] = (prev[i - 1][f] + prev[i][f] * 2 + prev[i + 1][f]) / 4;
    }
  }
  return out;
}

/**
 * Loft a closed superellipse tube through `stations` and split its faces into material keys.
 * classify(info) -> key, where info = { i, k, z, py, px } describes the face centre.
 * Returns Map<key, BufferGeometry>. Normals are computed on the whole loft, so seams stay smooth.
 */
export function loftKeyed(stations, segs, classify, capKeys = { front: null, rear: null }) {
  const S = stations.length;
  const units = [];
  for (let i = 0; i < S; i++) {
    const row = [];
    for (let k = 0; k < segs; k++) row.push(ringUnit(k, segs, stations[i].n));
    units.push(row);
  }
  const pos = new Float32Array(S * segs * 3);
  const uv = new Float32Array(S * segs * 2);
  for (let i = 0; i < S; i++) {
    const st = stations[i];
    const cy = (st.yb + st.yt) / 2, hh = (st.yt - st.yb) / 2;
    const ts = st.ts ?? 1;
    for (let k = 0; k < segs; k++) {
      const [px, py] = units[i][k];
      const sc = py > 0 ? 1 + (ts - 1) * py : 1;
      const o = (i * segs + k) * 3;
      pos[o] = px * st.hw * sc;
      pos[o + 1] = cy + py * hh;
      pos[o + 2] = st.z;
      uv[(i * segs + k) * 2] = k / segs;
      uv[(i * segs + k) * 2 + 1] = i / (S - 1);
    }
  }
  const all = [];
  const faceKeys = [];
  for (let i = 0; i < S - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const k1 = (k + 1) % segs;
      const a = i * segs + k, b = i * segs + k1, c = (i + 1) * segs + k1, d = (i + 1) * segs + k;
      const [pxa, pya] = units[i][k];
      const [pxb, pyb] = units[i][k1];
      const key = classify({
        i, k, z: (stations[i].z + stations[i + 1].z) / 2, py: (pya + pyb) / 2, px: (pxa + pxb) / 2,
      });
      all.push(a, b, c, a, c, d);
      faceKeys.push(key, key);
    }
  }
  const full = new THREE.BufferGeometry();
  full.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  full.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  full.setIndex(all);
  full.computeVertexNormals();
  const nor = full.attributes.normal.array;

  const buckets = new Map();
  for (let f = 0; f < faceKeys.length; f++) {
    const key = faceKeys[f];
    if (key == null) continue;
    let arr = buckets.get(key);
    if (!arr) buckets.set(key, (arr = []));
    arr.push(all[f * 3], all[f * 3 + 1], all[f * 3 + 2]);
  }
  const out = new Map();
  for (const [key, idx] of buckets) out.set(key, compact(pos, nor, uv, idx));

  // Flat end caps
  const cap = (i, key, dir) => {
    if (!key) return;
    const st = stations[i];
    const p = [], n = [], u = [], ix = [];
    const cy = (st.yb + st.yt) / 2;
    p.push(0, cy, st.z);
    n.push(0, 0, dir);
    u.push(0.5, 0.5);
    for (let k = 0; k < segs; k++) {
      const o = (i * segs + k) * 3;
      p.push(pos[o], pos[o + 1], pos[o + 2]);
      n.push(0, 0, dir);
      u.push(0.5 + pos[o] * 0.5, 0.5 + (pos[o + 1] - cy) * 0.5);
    }
    for (let k = 0; k < segs; k++) {
      const k1 = (k + 1) % segs;
      if (dir > 0) ix.push(0, 1 + k, 1 + k1);
      else ix.push(0, 1 + k1, 1 + k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    g.setIndex(ix);
    const prev = out.get(key);
    out.set(key, prev ? mergeGeometries([prev, g]) : g);
  };
  cap(S - 1, capKeys.front, 1);
  cap(0, capKeys.rear, -1);
  full.dispose();
  return out;
}

function compact(pos, nor, uv, idx) {
  const map = new Map();
  const p = [], n = [], u = [], ix = [];
  for (const v of idx) {
    let m = map.get(v);
    if (m === undefined) {
      m = p.length / 3;
      map.set(v, m);
      p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      n.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]);
      u.push(uv[v * 2], uv[v * 2 + 1]);
    }
    ix.push(m);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.setIndex(ix);
  return g;
}

/** Merge geometries that have position (+ optional normal/uv/index) into one indexed geometry. */
export function mergeGeometries(list) {
  let vCount = 0, iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    const c = p.count;
    for (let i = 0; i < c; i++) {
      pos[(vo + i) * 3] = p.getX(i);
      pos[(vo + i) * 3 + 1] = p.getY(i);
      pos[(vo + i) * 3 + 2] = p.getZ(i);
      nor[(vo + i) * 3] = n.getX(i);
      nor[(vo + i) * 3 + 1] = n.getY(i);
      nor[(vo + i) * 3 + 2] = n.getZ(i);
      if (u) {
        uv[(vo + i) * 2] = u.getX(i);
        uv[(vo + i) * 2 + 1] = u.getY(i);
      }
    }
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      io += a.length;
    } else {
      for (let i = 0; i < c; i++) idx[io + i] = vo + i;
      io += c;
    }
    vo += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Compose a transform matrix (Euler XYZ in radians). */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
  _e.set(rx, ry, rz, order);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Collects transformed geometry per material key, then merges each key into one mesh. */
export class Bins {
  constructor() {
    this.map = new Map();
  }

  add(key, geo, matrix, mirrorX = false) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    let list = this.map.get(key);
    if (!list) this.map.set(key, (list = []));
    list.push(g);
    if (mirrorX) {
      const m = geo.clone();
      if (matrix) m.applyMatrix4(matrix);
      m.applyMatrix4(_m.makeScale(-1, 1, 1));
      flipWinding(m);
      list.push(m);
    }
  }

  addMap(map, matrix) {
    for (const [k, g] of map) {
      if (matrix) g.applyMatrix4(matrix);
      let list = this.map.get(k);
      if (!list) this.map.set(k, (list = []));
      list.push(g);
    }
  }

  build(materials, { castShadow = true, shadowKeys = null } = {}) {
    const group = new THREE.Group();
    for (const [key, list] of this.map) {
      const mat = materials[key];
      if (!mat) {
        console.warn('Missing material', key);
        continue;
      }
      const geo = mergeGeometries(list);
      for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = key;
      mesh.castShadow = castShadow && (!shadowKeys || shadowKeys.includes(key));
      mesh.receiveShadow = false;
      group.add(mesh);
    }
    this.map.clear();
    return group;
  }
}

/** Reverse triangle winding (needed after mirroring with a negative scale). */
export function flipWinding(g) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    g.index.needsUpdate = true;
  } else {
    const p = g.attributes.position;
    const attrs = Object.values(g.attributes);
    for (let i = 0; i < p.count; i += 3) {
      for (const at of attrs) {
        const s = at.itemSize, arr = at.array;
        for (let c = 0; c < s; c++) {
          const t = arr[(i + 1) * s + c];
          arr[(i + 1) * s + c] = arr[(i + 2) * s + c];
          arr[(i + 2) * s + c] = t;
        }
      }
    }
  }
}

// Shared unit primitives (cloned on add, never mutated)
export const PRIM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  plane: new THREE.PlaneGeometry(1, 1),
};

/** Rounded rectangle shape (centered) for grilles / light housings. */
export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function extrudeShape(shape, depth, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
