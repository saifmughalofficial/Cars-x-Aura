// Turns a track definition (control points + style) into drivable data and meshes:
// arc-length samples with tangents / curvature, a spatial hash, the road ribbon, shoulders, walls,
// tunnels, ramps, bridge pillars, kerbs, start gantry and a blended heightfield terrain.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, rng, nextFrame } from '../game/utils.js';
import {
  roadTexture, surfaceTexture, terrainDetailTexture, checkerTexture, chevronTexture, kerbTexture, textTexture,
} from '../game/textures.js';

const UP_Y = 0;
const CELL = 32;

export class Track {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.group = new THREE.Group();
    this.group.name = 'track-' + def.id;
    this.disposables = [];
  }

  // ───────────────────────── build ─────────────────────────
  static async build(def, quality, onProgress = () => {}) {
    const t = new Track(def);
    t.quality = quality;
    onProgress(0.05, 'Laying out the route');
    t._sample();
    t._hash();
    t._features();
    await nextFrame();
    onProgress(0.15, 'Paving the road');
    t._buildRoad();
    t._buildWalls();
    t._buildKerbs();
    t._buildRamps();
    t._buildTunnels();
    t.gate = t.buildGate(0, def.gateText || 'CARS x AURA', def.gateColor || '#22e6ff');
    t.group.add(t.gate);
    await nextFrame();
    onProgress(0.35, 'Shaping the landscape');
    t._buildTerrain();
    t._buildPillars();
    if (def.oppositeRoad) t._buildOpposite();
    await nextFrame();
    onProgress(0.6, 'Placing scenery');
    if (def.scenery) await def.scenery(t._sceneryContext());
    onProgress(0.85, 'Finishing touches');
    return t;
  }

  _sample() {
    const def = this.def;
    const pts = def.points.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    const L0 = curve.getLength();
    const N = Math.round(L0 / 2);
    const sp = curve.getSpacedPoints(N);
    this.N = N;
    this.L = L0;
    this.ds = L0 / N;
    const px = (this.px = new Float32Array(N)), py = (this.py = new Float32Array(N)), pz = (this.pz = new Float32Array(N));
    for (let i = 0; i < N; i++) {
      px[i] = sp[i].x;
      py[i] = sp[i].y;
      pz[i] = sp[i].z;
    }
    // smooth elevation so the road never has kinks
    for (let pass = 0; pass < 4; pass++) {
      const c = py.slice();
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let k = -3; k <= 3; k++) s += c[(i + k + N) % N];
        py[i] = s / 7;
      }
    }
    const tx = (this.tx = new Float32Array(N)), tz = (this.tz = new Float32Array(N));
    const slope = (this.slope = new Float32Array(N));
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = px[b] - px[a], dz = pz[b] - pz[a];
      const l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l;
      tz[i] = dz / l;
      slope[i] = (py[b] - py[a]) / (2 * this.ds);
    }
    const curv = (this.curv = new Float32Array(N));
    for (let i = 0; i < N; i++) {
      const a = (i - 2 + N) % N, b = (i + 2) % N;
      // dot(t_b - t_a, right_i) / distance -> + means turning right
      const rxi = -tz[i], rzi = tx[i];
      curv[i] = ((tx[b] - tx[a]) * rxi + (tz[b] - tz[a]) * rzi) / (4 * this.ds);
    }
    // smoothed |curvature| for AI braking
    const ac = (this.absCurv = new Float32Array(N));
    for (let i = 0; i < N; i++) {
      let m = 0;
      for (let k = -2; k <= 2; k++) m = Math.max(m, Math.abs(curv[(i + k + N) % N]));
      ac[i] = m;
    }
    const r = def.road;
    this.hw = r.halfWidth;
    this.sh = r.shoulder;
    this.wallD = r.halfWidth + r.shoulder;
    this.shoulderIsRoad = !!r.shoulderIsRoad;
    this.extraRight = def.extraRight || 0;
    this.startS = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, px[i]);
      maxX = Math.max(maxX, px[i]);
      minZ = Math.min(minZ, pz[i]);
      maxZ = Math.max(maxZ, pz[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  _hash() {
    this.cells = new Map();
    for (let i = 0; i < this.N; i++) {
      const key = this._key(Math.floor(this.px[i] / CELL), Math.floor(this.pz[i] / CELL));
      let a = this.cells.get(key);
      if (!a) this.cells.set(key, (a = []));
      a.push(i);
    }
  }

  _key(cx, cz) {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  /** Nearest sample index within `radius` metres (or -1). */
  nearestIndex(x, z, radius = 200) {
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = -1, bd = radius * radius;
    for (let ix = -r; ix <= r; ix++)
      for (let iz = -r; iz <= r; iz++) {
        const a = this.cells.get(this._key(cx + ix, cz + iz));
        if (!a) continue;
        for (const i of a) {
          const dx = x - this.px[i], dz = z - this.pz[i];
          const d = dx * dx + dz * dz;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
    return best;
  }

  _features() {
    const L = this.L;
    this.ramps = (this.def.ramps || []).map((r) => ({ s0: r.at * L, s1: r.at * L + r.len, h: r.height, len: r.len }));
    this.tunnels = (this.def.tunnels || []).map((t) => ({ s0: t.from * L, s1: t.to * L }));
    this.sprint = this.def.sprint ? { start: this.def.sprint.start * L, length: this.def.sprint.length * L } : { start: 0.04 * L, length: 0.9 * L };
    this.bridge = new Uint8Array(this.N);
  }

  rampHeight(s, d) {
    for (const r of this.ramps) {
      if (s >= r.s0 && s <= r.s1 && Math.abs(d) < this.hw - 0.3) {
        const u = (s - r.s0) / r.len;
        return r.h * Math.pow(u, 1.35);
      }
    }
    return 0;
  }

  inTunnel(s) {
    for (const t of this.tunnels) if (s >= t.s0 && s <= t.s1) return true;
    return false;
  }

  makeQuery() {
    return { idx: 0, s: 0, d: 0, y: 0, groundY: 0, tx: 0, tz: 1, rx: -1, rz: 0, surface: 'road', t: 0 };
  }

  /** Project a world XZ point on the track. Uses q.idx as a search hint (O(1) per frame). */
  query(x, z, q) {
    const N = this.N, px = this.px, pz = this.pz;
    let best = q.idx, bd = Infinity;
    for (let k = -8; k <= 8; k++) {
      const i = (q.idx + k + N) % N;
      const dx = x - px[i], dz = z - pz[i];
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const lim = this.wallD + this.extraRight + 14;
    if (bd > lim * lim) {
      const g = this.nearestIndex(x, z, 400);
      if (g >= 0) best = g;
    }
    let i0 = best, i1 = (best + 1) % N;
    let t = this._proj(x, z, i0, i1);
    if (t < 0) {
      i1 = i0;
      i0 = (best - 1 + N) % N;
      t = this._proj(x, z, i0, i1);
    }
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = px[i0] + (px[i1] - px[i0]) * t, cz = pz[i0] + (pz[i1] - pz[i0]) * t;
    let tX = this.tx[i0] + (this.tx[i1] - this.tx[i0]) * t, tZ = this.tz[i0] + (this.tz[i1] - this.tz[i0]) * t;
    const l = Math.hypot(tX, tZ) || 1;
    tX /= l;
    tZ /= l;
    q.idx = t < 0.5 ? i0 : i1;
    q.t = t;
    q.tx = tX;
    q.tz = tZ;
    q.rx = -tZ;
    q.rz = tX;
    q.s = i0 * this.ds + t * this.ds;
    q.d = (x - cx) * q.rx + (z - cz) * q.rz;
    q.y = this.py[i0] + (this.py[i1] - this.py[i0]) * t;
    q.groundY = q.y + (this.ramps.length ? this.rampHeight(q.s, q.d) : 0);
    q.surface = Math.abs(q.d) <= this.hw + 0.2 || this.shoulderIsRoad ? 'road' : 'shoulder';
    return q;
  }

  _proj(x, z, i0, i1) {
    const ax = this.px[i0], az = this.pz[i0];
    const bx = this.px[i1] - ax, bz = this.pz[i1] - az;
    return ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1);
  }

  /** Frame at arc length s. */
  sampleAt(s, out = {}) {
    const L = this.L;
    s = ((s % L) + L) % L;
    const f = s / this.ds;
    const i0 = Math.floor(f) % this.N, i1 = (i0 + 1) % this.N, t = f - Math.floor(f);
    out.idx = i0;
    out.x = lerp(this.px[i0], this.px[i1], t);
    out.y = lerp(this.py[i0], this.py[i1], t);
    out.z = lerp(this.pz[i0], this.pz[i1], t);
    let tx = lerp(this.tx[i0], this.tx[i1], t), tz = lerp(this.tz[i0], this.tz[i1], t);
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l;
    out.tz = tz / l;
    out.rx = -out.tz;
    out.rz = out.tx;
    out.s = s;
    return out;
  }

  idxAt(s) {
    const L = this.L;
    s = ((s % L) + L) % L;
    return Math.floor(s / this.ds) % this.N;
  }

  wrapDelta(ds) {
    const L = this.L;
    if (ds > L / 2) return ds - L;
    if (ds < -L / 2) return ds + L;
    return ds;
  }

  // ───────────────────────── geometry helpers ─────────────────────────
  _track(o) {
    this.disposables.push(o);
    return o;
  }

  /** Ribbon between lateral offsets d0..d1 (y offset dy), over sample range [i0, i1] inclusive. */
  ribbon(d0, d1, { dy = 0, uScale = null, vScale = 10, i0 = 0, i1 = this.N, yFn = null } = {}) {
    const count = i1 - i0 + 1;
    const pos = new Float32Array(count * 2 * 3), uv = new Float32Array(count * 2 * 2);
    for (let c = 0; c < count; c++) {
      const i = (i0 + c) % this.N;
      const rx = -this.tz[i], rz = this.tx[i];
      const y = (yFn ? yFn(i) : this.py[i]) + dy;
      const s = (i0 + c) * this.ds;
      for (let e = 0; e < 2; e++) {
        const d = e ? d1 : d0;
        const o = (c * 2 + e) * 3;
        pos[o] = this.px[i] + rx * d;
        pos[o + 1] = y;
        pos[o + 2] = this.pz[i] + rz * d;
        uv[(c * 2 + e) * 2] = uScale ? d / uScale : e;
        uv[(c * 2 + e) * 2 + 1] = s / vScale;
      }
    }
    const idx = [];
    for (let c = 0; c < count - 1; c++) {
      const a = c * 2, b = c * 2 + 1, cc = c * 2 + 3, dd = c * 2 + 2;
      idx.push(a, b, dd, b, cc, dd);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** Sweep a 2D profile [[outwardOffset, height]...] along one side (side=+1 right, -1 left) at lateral baseD. */
  sweep(profile, side, baseD, { i0 = 0, i1 = this.N, vScale = 4, yFn = null } = {}) {
    const count = i1 - i0 + 1, P = profile.length;
    const pos = new Float32Array(count * P * 3), uv = new Float32Array(count * P * 2);
    const plen = [0];
    for (let j = 1; j < P; j++) plen.push(plen[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
    const total = plen[P - 1] || 1;
    for (let c = 0; c < count; c++) {
      const i = (i0 + c) % this.N;
      const rx = -this.tz[i], rz = this.tx[i];
      const y0 = yFn ? yFn(i) : this.py[i];
      for (let j = 0; j < P; j++) {
        const d = side * (baseD + profile[j][0]);
        const o = (c * P + j) * 3;
        pos[o] = this.px[i] + rx * d;
        pos[o + 1] = y0 + profile[j][1];
        pos[o + 2] = this.pz[i] + rz * d;
        uv[(c * P + j) * 2] = plen[j] / total;
        uv[(c * P + j) * 2 + 1] = ((i0 + c) * this.ds) / vScale;
      }
    }
    const idx = [];
    for (let c = 0; c < count - 1; c++)
      for (let j = 0; j < P - 1; j++) {
        const a = c * P + j, b = c * P + j + 1, cc = (c + 1) * P + j + 1, d = (c + 1) * P + j;
        if (side > 0) idx.push(a, b, cc, a, cc, d);
        else idx.push(a, cc, b, a, d, cc);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  mesh(geo, mat, { cast = false, receive = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.group.add(m);
    this._track(geo);
    this._track(mat);
    return m;
  }

  _std(params) {
    return this.quality.physical || !params.lambert
      ? new THREE.MeshStandardMaterial(params)
      : new THREE.MeshLambertMaterial({ color: params.color, map: params.map, emissive: params.emissive });
  }

  // ───────────────────────── road ─────────────────────────
  _buildRoad() {
    const r = this.def.road;
    const tex = roadTexture({ lanes: r.lanes, base: r.base, edge: r.edge, lane: r.lane, center: r.center, wet: r.wet, seed: r.seed || 3, key: 'road-' + this.id });
    this.roadTexLen = r.texLen || 48;
    const roadMat = new THREE.MeshStandardMaterial({
      map: tex, roughness: r.wet ? 0.32 : 0.86, metalness: r.wet ? 0.35 : 0.0, envMapIntensity: r.wet ? 1.2 : 0.4,
    });
    this.mesh(this.ribbon(-this.hw, this.hw, { vScale: this.roadTexLen }), roadMat);
    const shTex = surfaceTexture(r.shoulderKind || 'gravel');
    const shMat = new THREE.MeshStandardMaterial({ map: shTex, roughness: 0.95 });
    this.mesh(this.ribbon(-this.wallD, -this.hw, { uScale: 4, vScale: 4, dy: -0.01 }), shMat);
    this.mesh(this.ribbon(this.hw, this.wallD + this.extraRight * 0, { uScale: 4, vScale: 4, dy: -0.01 }), shMat);
    // skirts hide the gap to the terrain / form bridge decks
    const skirtMat = new THREE.MeshStandardMaterial({ color: r.skirt || '#5d5a55', roughness: 0.95, side: THREE.DoubleSide });
    const skirtL = this.sweep([[0, 0], [0.4, -1.4], [0.4, -3.5]], -1, this.wallD + 0.6);
    const skirtR = this.sweep([[0, 0], [0.4, -1.4], [0.4, -3.5]], 1, this.wallD + 0.6);
    this.mesh(skirtL, skirtMat);
    this.mesh(skirtR, skirtMat);
    // start/finish chequer
    this.addDecal(0, checkerTexture(), 3.2, this.hw * 2 - 0.4);
  }

  /** Flat decal across the road at arc length s. */
  addDecal(s, tex, len, width, dy = 0.025) {
    const smp = this.sampleAt(s);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    const g = new THREE.PlaneGeometry(width, len);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set(smp.x, smp.y + dy, smp.z);
    m.rotation.y = Math.atan2(smp.tx, smp.tz);
    m.receiveShadow = true;
    this.group.add(m);
    this._track(g);
    this._track(mat);
    return m;
  }

  _buildWalls() {
    const w = this.def.wall;
    const cast = this.quality.shadows > 0;
    if (w.kind === 'guardrail') {
      const mat = new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.75, roughness: 0.38, side: THREE.DoubleSide });
      const prof = [[0, 0.46], [0.07, 0.55], [0.02, 0.63], [0.07, 0.72], [0, 0.8]];
      for (const side of [-1, 1]) this.mesh(this.sweep(prof, side, this.wallD), mat, { cast });
      // posts
      const postGeo = new THREE.BoxGeometry(0.12, 0.85, 0.12);
      const postMat = new THREE.MeshStandardMaterial({ color: '#8e9298', metalness: 0.6, roughness: 0.5 });
      const step = Math.max(1, Math.round(4 / this.ds));
      const mats = [];
      for (const side of [-1, 1])
        for (let i = 0; i < this.N; i += step) {
          const d = side * (this.wallD + 0.16);
          mats.push(new THREE.Matrix4().makeTranslation(this.px[i] - this.tz[i] * d, this.py[i] + 0.42, this.pz[i] + this.tx[i] * d));
        }
      this.instanced(postGeo, postMat, mats);
    } else {
      const conc = new THREE.MeshStandardMaterial({ map: surfaceTexture('concrete'), color: w.color || '#cfcfcb', roughness: 0.9, side: THREE.DoubleSide });
      const prof = [[0, -0.05], [0, 0.1], [0.14, 0.28], [0.2, 0.92], [0.4, 0.92], [0.46, 0.28], [0.6, 0.1], [0.6, -0.05]];
      for (const side of [-1, 1]) this.mesh(this.sweep(prof, side, this.wallD), conc, { cast });
      if (w.stripe) {
        const stripe = new THREE.MeshStandardMaterial({ map: chevronTexture(w.stripe, '#151515'), roughness: 0.6, side: THREE.DoubleSide });
        for (const side of [-1, 1]) this.mesh(this.sweep([[0.155, 0.32], [0.19, 0.8]], side, this.wallD - 0.003, { vScale: 3 }), stripe);
      }
      if (w.neon) {
        for (const [side, color] of [[-1, w.neon[0]], [1, w.neon[1] || w.neon[0]]]) {
          const neon = new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: 1.3, side: THREE.DoubleSide });
          this.mesh(this.sweep([[0.19, 0.935], [0.41, 0.935]], side, this.wallD), neon, { receive: false });
        }
      }
    }
  }

  _buildKerbs() {
    if (!this.def.kerbs) return;
    const mat = new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.7 });
    const th = 1 / 110;
    let start = -1;
    const flush = (a, b, side) => {
      if (b - a < 6) return;
      const d0 = side > 0 ? this.hw - 0.9 : -this.hw - 0.5;
      const d1 = side > 0 ? this.hw + 0.5 : -this.hw + 0.9;
      this.mesh(this.ribbon(d0, d1, { i0: a, i1: b, uScale: 1.4, vScale: 4, dy: 0.02 }), mat);
    };
    for (const side of [-1, 1]) {
      start = -1;
      for (let i = 0; i <= this.N; i++) {
        const c = i < this.N ? this.curv[i] * side : 0;
        if (c > th && start < 0) start = i;
        else if ((c <= th || i === this.N) && start >= 0) {
          flush(Math.max(0, start - 4), Math.min(this.N - 1, i + 4), side);
          start = -1;
        }
      }
    }
  }

  _buildRamps() {
    if (!this.ramps.length) return;
    const top = new THREE.MeshStandardMaterial({ map: chevronTexture('#f2c418', '#1a1a1a'), roughness: 0.6 });
    const side = new THREE.MeshStandardMaterial({ color: '#5a5f66', metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide });
    for (const r of this.ramps) {
      const i0 = this.idxAt(r.s0), n = Math.ceil(r.len / this.ds);
      const hw = this.hw - 0.3;
      const yFn = (i) => {
        const s = (i - i0 + this.N) % this.N * this.ds;
        return this.py[i] + r.h * Math.pow(clamp(s / r.len, 0, 1), 1.35);
      };
      const g = this.ribbon(-hw, hw, { i0, i1: i0 + n, yFn, uScale: 2 * hw, vScale: 4 });
      // remap u so chevrons span the width
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) + 0.5);
      this.mesh(g, top, { cast: true });
      for (const sd of [-1, 1]) this.mesh(this.sweep([[0, 0], [0, -0.01]], sd, hw, { i0, i1: i0 + n, yFn }), side);
      // back face (vertical)
      const iEnd = (i0 + n) % this.N;
      const back = new THREE.PlaneGeometry(hw * 2, r.h);
      const m = new THREE.Mesh(back, side);
      m.position.set(this.px[iEnd], this.py[iEnd] + r.h / 2, this.pz[iEnd]);
      m.rotation.y = Math.atan2(this.tx[iEnd], this.tz[iEnd]);
      this.group.add(m);
      this._track(back);
      // side walls of the kicker
      for (const sd of [-1, 1]) {
        const g2 = this.sweep([[0, 0], [0, 1]], sd, hw, { i0, i1: i0 + n, yFn: (i) => this.py[i] });
        const pos = g2.attributes.position;
        for (let k = 0; k < pos.count; k++) if (k % 2 === 1) {
          const c = Math.floor(k / 2), i = (i0 + c) % this.N;
          pos.setY(k, yFn(i));
        }
        g2.computeVertexNormals();
        this.mesh(g2, side);
      }
    }
  }

  _buildTunnels() {
    if (!this.tunnels.length) return;
    const shell = new THREE.MeshStandardMaterial({ color: this.def.tunnelColor || '#3a3d46', roughness: 0.8, side: THREE.DoubleSide });
    const light = new THREE.MeshStandardMaterial({ color: '#fff', emissive: this.def.tunnelLight || '#ffd9a0', emissiveIntensity: 2.4, side: THREE.DoubleSide });
    const arch = [];
    const R = this.wallD + 0.6, Hh = 7.2;
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI - (k / 14) * Math.PI;
      arch.push([Math.cos(a) * R, 0.9 + Math.sin(a) * Hh]);
    }
    for (const t of this.tunnels) {
      const i0 = this.idxAt(t.s0), i1 = i0 + Math.ceil((t.s1 - t.s0) / this.ds);
      this.mesh(this.sweep(arch, 1, 0, { i0, i1, vScale: 8 }), shell, { cast: true });
      for (const off of [-2.2, 2.2]) {
        const strip = this.sweep([[off - 0.25, 0.9 + Hh - 0.3], [off + 0.25, 0.9 + Hh - 0.3]], 1, 0, { i0, i1 });
        this.mesh(strip, light, { receive: false });
      }
      // portals
      for (const i of [i0 % this.N, i1 % this.N]) {
        const g = new THREE.BoxGeometry(R * 2 + 3, 2, 1.2);
        const m = new THREE.Mesh(g, shell);
        m.position.set(this.px[i], this.py[i] + Hh + 1.4, this.pz[i]);
        m.rotation.y = Math.atan2(this.tx[i], this.tz[i]);
        m.castShadow = true;
        this.group.add(m);
        this._track(g);
      }
    }
  }

  /** Overhead gantry with banner at arc length s. */
  buildGate(s, text, color = '#22e6ff', sub = 'START  •  FINISH') {
    const smp = this.sampleAt(s);
    const g = new THREE.Group();
    const span = this.wallD * 2 + 2;
    const metal = new THREE.MeshStandardMaterial({ color: '#2a2d35', metalness: 0.7, roughness: 0.35 });
    const tex = textTexture(1024, 128, {
      bg: '#07080d', border: color, borderWidth: 5, radius: 6,
      lines: [
        { text, size: 64, color: '#ffffff', y: 52, font: 'Orbitron, "Segoe UI", sans-serif', glow: color },
        { text: sub, size: 26, color, y: 104, font: 'Rajdhani, "Segoe UI", sans-serif' },
      ],
    });
    const banner = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.8, roughness: 0.5 });
    const pil = new THREE.BoxGeometry(0.7, 8, 0.7);
    for (const sd of [-1, 1]) {
      const m = new THREE.Mesh(pil, metal);
      m.position.set(sd * (span / 2), 4, 0);
      m.castShadow = true;
      g.add(m);
    }
    const beamG = new THREE.BoxGeometry(span + 0.7, 1.6, 0.6);
    const beam = new THREE.Mesh(beamG, [metal, metal, metal, metal, banner, banner]);
    beam.position.y = 7.6;
    beam.castShadow = true;
    g.add(beam);
    const stripG = new THREE.BoxGeometry(span, 0.08, 0.66);
    const stripM = new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: 2.5 });
    const strip = new THREE.Mesh(stripG, stripM);
    strip.position.y = 6.75;
    g.add(strip);
    g.position.set(smp.x, smp.y, smp.z);
    g.rotation.y = Math.atan2(smp.tx, smp.tz);
    g.userData.dispose = () => {
      for (const o of [metal, banner, pil, beamG, stripG, stripM, tex]) o.dispose();
    };
    this.disposables.push({ dispose: g.userData.dispose });
    return g;
  }

  instanced(geo, mat, matrices, { cast = false, receive = true, colors = null } = {}) {
    if (!matrices.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, matrices.length);
    for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
    if (colors) for (let i = 0; i < colors.length; i++) im.setColorAt(i, colors[i]);
    im.castShadow = cast;
    im.receiveShadow = receive;
    im.computeBoundingSphere();
    im.matrixAutoUpdate = false;
    im.updateMatrix();
    this.group.add(im);
    this._track(geo);
    this._track(mat);
    return im;
  }

  // ───────────────────────── terrain ─────────────────────────
  /** Final ground height (natural terrain blended into the road corridor). */
  terrainHeight(x, z, info = null) {
    const T = this.def.terrain;
    const natural = T.height(x, z);
    const blend = T.blend || 45;
    const cL = this.wallD + 1.2, cR = this.wallD + this.extraRight + 1.2;
    const idx = this.nearestIndex(x, z, cR + blend + 8);
    let h = natural, outside = 1e9;
    if (idx >= 0) {
      const rx = -this.tz[idx], rz = this.tx[idx];
      const d = (x - this.px[idx]) * rx + (z - this.pz[idx]) * rz;
      outside = d > 0 ? d - cR : -d - cL;
      const roadY = this.py[idx] - 0.5;
      let w = outside <= 0 ? 1 : 1 - smoothstep(0, blend, outside);
      if (!T.bridgeZone || T.bridgeZone(x, z)) w *= smoothstep(-7, -2.8, natural - roadY); // valleys stay low (bridges)
      h = lerp(natural, roadY, w);
    }
    if (info) {
      info.natural = natural;
      info.outside = outside;
      info.idx = idx;
    }
    return h;
  }

  _buildTerrain() {
    const T = this.def.terrain;
    const b = this.bounds;
    const margin = T.margin ?? 500;
    const x0 = b.minX - margin, x1 = b.maxX + margin, z0 = b.minZ - margin, z1 = b.maxZ + margin;
    let step = this.quality.terrainStep;
    const area = (x1 - x0) * (z1 - z0);
    step = Math.max(step, Math.sqrt(area / 110000));
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    const info = {};
    const c = [0, 0, 0];
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * step, z = z0 + j * step;
        const h = this.terrainHeight(x, z, info);
        const o = j * nx + i;
        pos[o * 3] = x;
        pos[o * 3 + 1] = h;
        pos[o * 3 + 2] = z;
        uv[o * 2] = x / 14;
        uv[o * 2 + 1] = z / 14;
        T.color(x, z, h, info, c);
        if (info.outside < 7 && T.verge) {
          const k = 1 - smoothstep(0, 7, info.outside);
          c[0] = lerp(c[0], T.verge[0], k);
          c[1] = lerp(c[1], T.verge[1], k);
          c[2] = lerp(c[2], T.verge[2], k);
        }
        col[o * 3] = c[0];
        col[o * 3 + 1] = c[1];
        col[o * 3 + 2] = c[2];
      }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let p = 0;
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, bb = a + 1, cc = a + nx, d = cc + 1;
        idx[p++] = a; idx[p++] = cc; idx[p++] = bb;
        idx[p++] = bb; idx[p++] = cc; idx[p++] = d;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const detail = terrainDetailTexture(T.detail || 'grass');
    const mat = this.quality.physical
      ? new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.96, metalness: 0 })
      : new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
    const m = this.mesh(g, mat, { receive: true });
    m.name = 'terrain';
    if (T.water) {
      const wg = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      wg.rotateX(-Math.PI / 2);
      const wm = new THREE.MeshStandardMaterial({ color: T.water.color, roughness: T.water.roughness ?? 0.08, metalness: 0.4, envMapIntensity: 1.5 });
      const w = this.mesh(wg, wm, { receive: false });
      w.position.set((x0 + x1) / 2, T.water.level, (z0 + z1) / 2);
      w.updateMatrix();
      this.water = w;
    }
    // flag bridge samples
    for (let i = 0; i < this.N; i++) {
      const x = this.px[i], z = this.pz[i];
      this.bridge[i] = T.height(x, z) < this.py[i] - 3 && (!T.bridgeZone || T.bridgeZone(x, z)) ? 1 : 0;
    }
  }

  _buildPillars() {
    const T = this.def.terrain;
    const step = Math.round(16 / this.ds);
    const mats = [];
    for (let i = 0; i < this.N; i += step) {
      if (!this.bridge[i]) continue;
      for (const sd of [-0.55, 0.55]) {
        const d = sd * this.hw;
        const x = this.px[i] - this.tz[i] * d, z = this.pz[i] + this.tx[i] * d;
        const ground = Math.min(T.height(x, z), T.water ? T.water.level : 1e9) - 2;
        const top = this.py[i] - 1.3;
        const hgt = top - ground;
        if (hgt < 1) continue;
        mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, (top + ground) / 2, z), new THREE.Quaternion(), new THREE.Vector3(1.4, hgt, 1.4)));
      }
    }
    if (mats.length) {
      const mat = new THREE.MeshStandardMaterial({ map: surfaceTexture('concrete'), color: '#b8b6b0', roughness: 0.9 });
      this.instanced(new THREE.CylinderGeometry(0.5, 0.55, 1, 12), mat, mats, { cast: true });
    }
  }

  _buildOpposite() {
    const o = this.def.oppositeRoad;
    const d0 = this.wallD + o.median;
    const d1 = d0 + o.width;
    const tex = roadTexture({ lanes: o.lanes || 3, base: this.def.road.base, edge: '#f2f2f2', lane: '#f2f2f2', seed: 9, key: 'road-opp-' + this.id });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88 });
    this.mesh(this.ribbon(d0, d1, { vScale: this.roadTexLen, dy: -0.02 }), mat);
    const med = new THREE.MeshStandardMaterial({ map: surfaceTexture(o.medianKind || 'grass'), roughness: 0.95 });
    this.mesh(this.ribbon(this.wallD, d0, { uScale: 4, vScale: 4, dy: -0.04 }), med);
    const shMat = new THREE.MeshStandardMaterial({ map: surfaceTexture(this.def.road.shoulderKind || 'gravel'), roughness: 0.95 });
    this.mesh(this.ribbon(d1, d1 + 2.5, { uScale: 4, vScale: 4, dy: -0.03 }), shMat);
    this.oppositeLanes = [];
    const lw = o.width / (o.lanes || 3);
    for (let l = 0; l < (o.lanes || 3); l++) this.oppositeLanes.push(d0 + lw * (l + 0.5));
  }

  // ───────────────────────── scenery context ─────────────────────────
  _sceneryContext() {
    const track = this;
    return {
      track,
      THREE,
      quality: this.quality,
      density: this.quality.scenery,
      rng: rng(this.def.seed || 11),
      group: this.group,
      height: (x, z) => track.terrainHeight(x, z),
      /** distance outside the drivable corridor (negative = on the road) */
      clearance(x, z) {
        const idx = track.nearestIndex(x, z, 120);
        if (idx < 0) return 1e9;
        const d = (x - track.px[idx]) * -track.tz[idx] + (z - track.pz[idx]) * track.tx[idx];
        return d > 0 ? d - track.wallD - track.extraRight : -d - track.wallD;
      },
      instanced: (geo, mat, m, opts) => track.instanced(geo, mat, m, opts),
      add: (o) => {
        track.group.add(o);
        o.traverse((c) => {
          if (c.geometry) track._track(c.geometry);
          if (c.material) for (const mm of [].concat(c.material)) track._track(mm);
        });
        return o;
      },
      /** point at arc length s with lateral offset d */
      at(s, d = 0) {
        const p = track.sampleAt(s);
        return { x: p.x + p.rx * d, y: p.y, z: p.z + p.rz * d, yaw: Math.atan2(p.tx, p.tz), p };
      },
    };
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.userData && o.userData.dispose) o.userData.dispose();
    });
    for (const d of this.disposables) {
      if (!d) continue;
      if (d.isMaterial) {
        for (const k of ['map', 'emissiveMap']) if (d[k] && !d[k].userData.shared) d[k].dispose();
      }
      if (d.dispose) d.dispose();
    }
    this.disposables.length = 0;
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
