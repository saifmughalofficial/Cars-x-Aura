// Reusable, instanced scenery builders shared by the three tracks.
import * as THREE from 'three';
import { textTexture, windowTexture, glowTexture, surfaceTexture } from '../game/textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function mat4(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.set(x, y, z).clone(), _q.clone(), _s.set(sx, sy, sz).clone());
}

/** Add a constant vertex colour to a geometry (non-indexed copy). */
export function tint(geo, color, jitter = 0, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  let s = seed;
  for (let i = 0; i < n; i += 3) {
    s = (s * 16807) % 2147483647;
    const j = 1 + ((s / 2147483647) - 0.5) * jitter;
    for (let k = 0; k < 3 && i + k < n; k++) {
      arr[(i + k) * 3] = c.r * j;
      arr[(i + k) * 3 + 1] = c.g * j;
      arr[(i + k) * 3 + 2] = c.b * j;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

/** Merge non-indexed geometries that all have position/normal/color/uv. */
export function mergeColored(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'uv']) {
    const size = name === 'uv' ? 2 : 3;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[name];
      if (a) arr.set(a.array.subarray(0, a.count * size), o);
      o += g.attributes.position.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const g of list) g.dispose();
  return out;
}

function xf(geo, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
  geo.applyMatrix4(mat4(x, y, z, ry, sx, sy, sz));
  return geo;
}

// ───────────────────────── vegetation ─────────────────────────
export function treeGeometry(kind = 'broadleaf') {
  const parts = [];
  if (kind === 'eucalyptus') {
    parts.push(tint(xf(new THREE.CylinderGeometry(0.16, 0.26, 7, 6), 0, 3.5, 0), '#d9d2c3', 0.1));
    parts.push(tint(xf(new THREE.IcosahedronGeometry(1, 0), 0, 7.6, 0, 2.2, 2.8, 2.2), '#5b7a3b', 0.25, 3));
    parts.push(tint(xf(new THREE.IcosahedronGeometry(1, 0), 0.5, 9.4, 0.3, 1.6, 2, 1.6), '#6b8a44', 0.25, 5));
  } else if (kind === 'palm') {
    parts.push(tint(xf(new THREE.CylinderGeometry(0.18, 0.3, 8, 6), 0, 4, 0), '#7a5a36', 0.15));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = new THREE.BoxGeometry(0.5, 0.06, 3.4);
      leaf.translate(0, 0, 1.6);
      leaf.rotateX(0.45);
      leaf.rotateY(a);
      leaf.translate(0, 8, 0);
      parts.push(tint(leaf, '#4f7a2c', 0.3, i + 2));
    }
  } else if (kind === 'shrub') {
    parts.push(tint(xf(new THREE.IcosahedronGeometry(1, 0), 0, 0.5, 0, 1.2, 0.7, 1.2), '#8a7a4a', 0.3, 7));
  } else if (kind === 'pine') {
    parts.push(tint(xf(new THREE.CylinderGeometry(0.15, 0.25, 2, 6), 0, 1, 0), '#5a4028'));
    parts.push(tint(xf(new THREE.ConeGeometry(1.8, 4.5, 7), 0, 4, 0), '#2f5a2c', 0.2, 9));
    parts.push(tint(xf(new THREE.ConeGeometry(1.3, 3.2, 7), 0, 6.2, 0), '#386a33', 0.2, 10));
  } else {
    parts.push(tint(xf(new THREE.CylinderGeometry(0.22, 0.34, 3, 6), 0, 1.5, 0), '#5a4028'));
    parts.push(tint(xf(new THREE.IcosahedronGeometry(1, 1), 0, 4.4, 0, 2.8, 2.3, 2.8), '#46682c', 0.22, 4));
    parts.push(tint(xf(new THREE.IcosahedronGeometry(1, 0), 1, 5.2, 0.6, 1.6, 1.4, 1.6), '#557a33', 0.22, 6));
  }
  const g = mergeColored(parts);
  g.computeVertexNormals();
  return g;
}

export function vegMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
}

/**
 * Scatter instances in a rectangle, keeping `minClear`..`maxClear` metres from the road edge.
 * Returns matrices (and optional per-instance colours).
 */
export function scatter(ctx, count, { minClear = 10, maxClear = 400, scale = [0.8, 1.3], area = null, avoid = null, sink = 0, yawRand = true, minH = -1e9 } = {}) {
  const b = ctx.track.bounds;
  const pad = maxClear;
  const a = area || { x0: b.minX - pad, x1: b.maxX + pad, z0: b.minZ - pad, z1: b.maxZ + pad };
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 12) {
    tries++;
    const x = a.x0 + ctx.rng() * (a.x1 - a.x0), z = a.z0 + ctx.rng() * (a.z1 - a.z0);
    const c = ctx.clearance(x, z);
    if (c < minClear || c > maxClear) continue;
    if (avoid && avoid(x, z)) continue;
    const y = ctx.height(x, z);
    if (y < minH) continue;
    const s = scale[0] + ctx.rng() * (scale[1] - scale[0]);
    out.push(mat4(x, y - sink, z, yawRand ? ctx.rng() * Math.PI * 2 : 0, s, s * (0.85 + ctx.rng() * 0.3), s));
  }
  return out;
}

/** Instances lined up along the road at lateral offset d (both sides when d is an array). */
export function alongRoad(ctx, every, offsets, fn) {
  const L = ctx.track.L;
  for (let s = 0; s < L; s += every) for (const d of offsets) {
    const p = ctx.at(s, d);
    fn(p, s, d);
  }
}

export function rockGeometry(seed = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  let s = seed * 9301 + 49297;
  for (let i = 0; i < pos.count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const k = 0.75 + (s / 233280) * 0.5;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.8, pos.getZ(i) * k);
  }
  // merge duplicated vertices' displacement consistency is not required for flat-shaded rocks
  g.computeVertexNormals();
  return g;
}

// ───────────────────────── distant mountains ─────────────────────────
export function mountainRing(ctx, { radius, count = 40, height = [120, 260], color = '#6f7b8c', snow = null, y = -10 }) {
  const b = ctx.track.bounds;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + ctx.rng() * 0.1;
    const r = radius * (0.9 + ctx.rng() * 0.25);
    const h = height[0] + ctx.rng() * (height[1] - height[0]);
    const w = h * (1.4 + ctx.rng() * 1.2);
    const cone = new THREE.ConeGeometry(w, h, 6 + Math.floor(ctx.rng() * 3), 1);
    cone.translate(cx + Math.cos(a) * r, y + h / 2, cz + Math.sin(a) * r);
    parts.push(tint(cone, color, 0.25, i + 1));
    if (snow && h > (height[0] + height[1]) / 2) {
      const cap = new THREE.ConeGeometry(w * 0.28, h * 0.28, 6);
      cap.translate(cx + Math.cos(a) * r, y + h * 0.86 + 0.5, cz + Math.sin(a) * r);
      parts.push(tint(cap, snow, 0.05, i));
    }
  }
  const g = mergeColored(parts);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.matrixAutoUpdate = false;
  return ctx.add(m);
}

// ───────────────────────── signs & boards ─────────────────────────
export function signBoard(ctx, { s, d, w = 6, h = 3, tex, postColor = '#8d9196', height = 3.2, emissive = 0, twoPosts = true, face = 0 }) {
  const p = ctx.at(s, d);
  const g = new THREE.Group();
  const boardMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: emissive ? '#ffffff' : '#000000', emissiveMap: emissive ? tex : null, emissiveIntensity: emissive });
  const back = new THREE.MeshStandardMaterial({ color: '#6b6e73', metalness: 0.6, roughness: 0.4 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), [back, back, back, back, boardMat, back]);
  board.position.y = height + h / 2;
  board.castShadow = true;
  g.add(board);
  const postMat = new THREE.MeshStandardMaterial({ color: postColor, metalness: 0.6, roughness: 0.45 });
  const pg = new THREE.CylinderGeometry(0.1, 0.12, height + h * 0.6, 8);
  for (const x of twoPosts ? [-w * 0.32, w * 0.32] : [0]) {
    const post = new THREE.Mesh(pg, postMat);
    post.position.set(x, (height + h * 0.6) / 2, -0.12);
    post.castShadow = true;
    g.add(post);
  }
  g.position.set(p.x, ctx.height(p.x, p.z) + 0.1, p.z);
  // face oncoming traffic (towards -tangent) by default
  g.rotation.y = p.yaw + Math.PI + face;
  return ctx.add(g);
}

export function motorwaySign(ctx, s, d, lines) {
  const tex = textTexture(512, 256, {
    bg: '#0b6b3a', border: '#ffffff', borderWidth: 7,
    lines: lines.map((l, i) => ({ text: l, size: i === 0 ? 46 : 40, y: 62 + i * 66, color: '#ffffff', font: '"Segoe UI", "Noto Nastaliq Urdu", "Urdu Typesetting", Arial, sans-serif' })),
  });
  return signBoard(ctx, { s, d, w: 6.4, h: 3.2, tex, height: 3.4 });
}

export function billboard(ctx, s, d, title, sub, colors = ['#07080d', '#22e6ff'], emissive = 0.6) {
  const tex = textTexture(1024, 512, {
    bg: colors[0], border: colors[1], borderWidth: 10, radius: 18,
    lines: [
      { text: title, size: 120, y: 220, color: '#ffffff', font: 'Orbitron, "Segoe UI", sans-serif', glow: colors[1], blur: 30 },
      { text: sub, size: 54, y: 360, color: colors[1], font: 'Rajdhani, "Segoe UI", sans-serif' },
    ],
  });
  return signBoard(ctx, { s, d, w: 14, h: 7, tex, height: 5, emissive, postColor: '#3a3d44' });
}

// ───────────────────────── lamps ─────────────────────────
export function streetLamps(ctx, { every = 36, side = [-1, 1], color = '#ffd28a', poolColor = 'rgba(255,200,130,1)', height = 9, offset = 1.4, pools = true, poolOpacity = 0.35 }) {
  const t = ctx.track;
  const poles = [], heads = [], poolM = [];
  alongRoad(ctx, every, side.map((sd) => sd * (t.wallD + offset)), (p, s, d) => {
    const sd = Math.sign(d);
    const yaw = p.yaw;
    const gy = p.y;
    poles.push(mat4(p.x, gy + height / 2, p.z, yaw, 1, height, 1));
    // arm reaches over the road
    const ax = p.x - p.p.rx * sd * 2.2, az = p.z - p.p.rz * sd * 2.2;
    heads.push(mat4(ax, gy + height, az, yaw, 1, 1, 1));
    if (pools) {
      const lx = p.x - p.p.rx * sd * (offset + 4), lz = p.z - p.p.rz * sd * (offset + 4);
      poolM.push(mat4(lx, gy + 0.05, lz, yaw, 1, 1, 1));
    }
  });
  const poleMat = new THREE.MeshStandardMaterial({ color: '#30333a', metalness: 0.7, roughness: 0.4 });
  ctx.instanced(new THREE.CylinderGeometry(0.09, 0.14, 1, 6), poleMat, poles, { cast: ctx.quality.shadows > 0 });
  const headMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: color, emissiveIntensity: 1.6 });
  ctx.instanced(new THREE.BoxGeometry(4.6, 0.18, 0.5), headMat, heads, {});
  if (pools && poolM.length) {
    const g = new THREE.PlaneGeometry(13, 13);
    g.rotateX(-Math.PI / 2);
    const pm = new THREE.MeshBasicMaterial({ map: glowTexture(poolColor, 'rgba(0,0,0,0)', 'pool-' + poolColor), transparent: true, opacity: poolOpacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const im = ctx.instanced(g, pm, poolM, { receive: false });
    if (im) im.renderOrder = 2;
  }
}

// ───────────────────────── buildings ─────────────────────────
/** Instanced city blocks with lit windows. Splits into height classes so windows keep their size. */
export function cityBlocks(ctx, { spacing = 40, minClear = 12, avoid = null, maxH = 150, center = null, night = true, palette = ['#1b1e2a', '#232838', '#2a2233'] }) {
  const t = ctx.track, b = t.bounds;
  const pad = 260;
  const classes = [[12, 36], [36, 80], [80, maxH]];
  const buckets = classes.map(() => ({ m: [], c: [] }));
  const roofs = [];
  const cx = center ? center[0] : (b.minX + b.maxX) / 2, cz = center ? center[1] : (b.minZ + b.maxZ) / 2;
  const maxR = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.6 + pad;
  for (let x = b.minX - pad; x <= b.maxX + pad; x += spacing)
    for (let z = b.minZ - pad; z <= b.maxZ + pad; z += spacing) {
      if (ctx.rng() > ctx.density * 1.1 + 0.15) continue;
      const fw = spacing * (0.45 + ctx.rng() * 0.35), fd = spacing * (0.45 + ctx.rng() * 0.35);
      const jx = x + (ctx.rng() - 0.5) * spacing * 0.2, jz = z + (ctx.rng() - 0.5) * spacing * 0.2;
      const r = Math.hypot(jx - cx, jz - cz);
      const clear = Math.min(
        ctx.clearance(jx, jz), ctx.clearance(jx + fw / 2, jz + fd / 2), ctx.clearance(jx - fw / 2, jz - fd / 2),
        ctx.clearance(jx + fw / 2, jz - fd / 2), ctx.clearance(jx - fw / 2, jz + fd / 2),
      );
      if (clear < minClear) continue;
      if (avoid && avoid(jx, jz, Math.max(fw, fd))) continue;
      const tall = 1 - Math.min(1, r / maxR);
      let h = 14 + Math.pow(ctx.rng(), 1.6) * (maxH - 14) * (0.35 + tall * 0.9);
      h = Math.min(maxH, h);
      const ci = h < 36 ? 0 : h < 80 ? 1 : 2;
      const y = ctx.height(jx, jz);
      buckets[ci].m.push(mat4(jx, y + h / 2 - 0.5, jz, 0, fw, h, fd));
      buckets[ci].c.push(new THREE.Color(palette[Math.floor(ctx.rng() * palette.length)]).multiplyScalar(0.8 + ctx.rng() * 0.4));
      if (night && ctx.rng() < 0.45) roofs.push({ x: jx, y: y + h, z: jz, w: fw, d: fd });
    }
  const base = windowTexture(5, night);
  buckets.forEach((bk, i) => {
    if (!bk.m.length) return;
    const tex = base.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const avgH = (classes[i][0] + classes[i][1]) / 2;
    tex.repeat.set(3, avgH / 15);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: night ? tex : null, emissive: night ? '#ffffff' : '#000000', emissiveIntensity: night ? 0.55 : 0,
      roughness: 0.55, metalness: 0.3,
    });
    // roof faces must not show windows: use a darker top via geometry groups
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const roofMat = new THREE.MeshStandardMaterial({ color: '#15161c', roughness: 0.9 });
    const im = new THREE.InstancedMesh(geo, [mat, mat, roofMat, roofMat, mat, mat], bk.m.length);
    bk.m.forEach((m, k) => {
      im.setMatrixAt(k, m);
      im.setColorAt(k, bk.c[k]);
    });
    im.castShadow = ctx.quality.shadows > 1024;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    ctx.add(im);
  });
  if (roofs.length) {
    const neonCols = ['#ff2bd6', '#22e6ff', '#8a5cff', '#ffb02e'];
    const per = neonCols.map(() => []);
    for (const r of roofs) {
      const k = Math.floor(ctx.rng() * neonCols.length);
      per[k].push(mat4(r.x, r.y + 0.12, r.z, 0, r.w + 0.3, 0.25, r.d + 0.3));
    }
    per.forEach((list, k) => {
      if (!list.length) return;
      const m = new THREE.MeshStandardMaterial({ color: '#000', emissive: neonCols[k], emissiveIntensity: 2.4 });
      // hollow frame look: thin box ring approximated by 4 slim boxes is costly; use a flat glowing cap edge
      ctx.instanced(new THREE.BoxGeometry(1, 1, 1), m, list, { receive: false });
    });
  }
}

export function neonSign(ctx, s, d, text, color, { w = 12, h = 4, height = 10, sub = null } = {}) {
  const tex = textTexture(1024, 340, {
    bg: '#05050a', border: color, borderWidth: 8, radius: 26,
    lines: [
      { text, size: sub ? 120 : 150, y: sub ? 140 : 170, color: '#ffffff', font: 'Orbitron, "Segoe UI", sans-serif', glow: color, blur: 34 },
      ...(sub ? [{ text: sub, size: 58, y: 262, color, font: 'Rajdhani, "Segoe UI", sans-serif' }] : []),
    ],
  });
  return signBoard(ctx, { s, d, w, h, tex, height, emissive: 1.6, postColor: '#22252c' });
}

export function concreteMaterial(color = '#b8b6b0') {
  return new THREE.MeshStandardMaterial({ map: surfaceTexture('concrete'), color, roughness: 0.9 });
}
