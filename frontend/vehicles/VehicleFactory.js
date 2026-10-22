// Procedural car builder. Each body is a superellipse loft (lower body + greenhouse) driven by the
// numbers in VehicleConfig.js, then dressed with lights, grilles, wheels, mirrors, spoilers and an
// interior. Static parts are merged per material, so a whole car is ~20 draw calls.
import * as THREE from 'three';
import {
  densify, loftKeyed, stationAt, extentX, Bins, M, PRIM, roundedRectShape, extrudeShape, mergeGeometries,
} from './geometry.js';
import { FINISHES } from './VehicleConfig.js';
import { plateTexture, grilleTexture, blobShadowTexture } from '../game/textures.js';

const SEGS = 28;
const lerp = (a, b, t) => a + (b - a) * t;

// ───────────────────────── materials ─────────────────────────
const sharedCache = {};

function shared(physical) {
  const k = physical ? 'p' : 's';
  if (sharedCache[k]) return sharedCache[k];
  const Std = THREE.MeshStandardMaterial;
  const glass = physical
    ? new THREE.MeshPhysicalMaterial({
      color: 0x121a24, metalness: 0.5, roughness: 0.04, transparent: true, opacity: 0.965,
      envMapIntensity: 2.6, clearcoat: 1, clearcoatRoughness: 0.02,
    })
    : new Std({ color: 0x121a24, metalness: 0.8, roughness: 0.06, transparent: true, opacity: 0.965, envMapIntensity: 2.2 });
  const m = {
    glass,
    gloss: new Std({ color: 0x07080a, metalness: 0.45, roughness: 0.16, envMapIntensity: 1.2 }),
    carbon: new Std({ color: 0x131418, metalness: 0.55, roughness: 0.26 }),
    trim: new Std({ color: 0x141518, metalness: 0.08, roughness: 0.72 }),
    under: new Std({ color: 0x09090a, metalness: 0, roughness: 1 }),
    chrome: new Std({ color: 0xe4e8ee, metalness: 1, roughness: 0.1, envMapIntensity: 1.4 }),
    rubber: new Std({ color: 0x151517, metalness: 0, roughness: 0.92, side: THREE.DoubleSide }),
    disc: new Std({ color: 0x7a7c80, metalness: 0.85, roughness: 0.36 }),
    interior: new Std({ color: 0x1a1b1f, metalness: 0.05, roughness: 0.82 }),
    arch: new THREE.MeshBasicMaterial({ color: 0x040405 }),
    honey: new Std({ map: grilleTexture('honey'), metalness: 0.3, roughness: 0.5 }),
    diamond: new Std({ map: grilleTexture('diamond'), metalness: 0.6, roughness: 0.3 }),
    slats: new Std({ map: grilleTexture('slats'), metalness: 0.4, roughness: 0.4 }),
    rev: new Std({ color: 0xeeeeee, emissive: 0xffffff, emissiveIntensity: 0.15 }),
    amber: new Std({ color: 0x8a4a00, emissive: 0xff8a00, emissiveIntensity: 0.5 }),
  };
  for (const v of Object.values(m)) v.userData.shared = true;
  sharedCache[k] = m;
  return m;
}

export function makePaint(color, finish = 'metallic', physical = true) {
  const f = FINISHES[finish] || FINISHES.metallic;
  if (physical) {
    const p = new THREE.MeshPhysicalMaterial({
      color, metalness: f.metalness, roughness: f.roughness, clearcoat: f.clearcoat,
      clearcoatRoughness: f.clearcoatRoughness, envMapIntensity: 1.25,
    });
    if (f.iridescence) {
      p.iridescence = f.iridescence;
      p.iridescenceIOR = 1.5;
      p.iridescenceThicknessRange = [200, 600];
      p.sheen = 0.4;
      p.sheenColor = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5);
    }
    return p;
  }
  return new THREE.MeshStandardMaterial({
    color, metalness: f.metalness * 0.9, roughness: Math.max(0.18, f.roughness), envMapIntensity: 1.2,
  });
}

/** Re-paint an existing paint material in place (garage colour picker). */
export function updatePaint(mat, color, finish) {
  const f = FINISHES[finish] || FINISHES.metallic;
  mat.color.set(color);
  mat.metalness = f.metalness;
  mat.roughness = mat.isMeshPhysicalMaterial ? f.roughness : Math.max(0.18, f.roughness);
  if (mat.isMeshPhysicalMaterial) {
    mat.clearcoat = f.clearcoat;
    mat.clearcoatRoughness = f.clearcoatRoughness;
    mat.iridescence = f.iridescence || 0;
    mat.sheen = f.iridescence ? 0.4 : 0;
    if (f.iridescence) mat.sheenColor.set(color).lerp(new THREE.Color('#ffffff'), 0.5);
  }
  mat.needsUpdate = true;
}

// ───────────────────────── wheels ─────────────────────────
function wheelGeometries(cfg, tireW, low) {
  const r = cfg.dims.r;
  const boxy = cfg.type === 'suv' || cfg.type === 'pickup';
  const rimR = r * (boxy ? 0.64 : cfg.type === 'sports' || cfg.type === 'hyper' ? 0.76 : 0.71);
  const w = tireW;
  const prof = [
    [rimR - 0.005, -w / 2 + 0.012], [r - 0.035, -w / 2], [r - 0.008, -w / 2 + 0.022], [r, -w / 2 + 0.055],
    [r, w / 2 - 0.055], [r - 0.008, w / 2 - 0.022], [r - 0.035, w / 2], [rimR - 0.005, w / 2 - 0.012],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tire = new THREE.LatheGeometry(prof, low ? 18 : 28);
  tire.rotateZ(-Math.PI / 2);

  const bins = new Bins();
  const face = w / 2 - 0.025;
  const barrel = new THREE.CylinderGeometry(rimR, rimR, w - 0.03, low ? 16 : 24, 1, true);
  bins.add('rim', barrel, M(0, 0, 0, 0, 0, Math.PI / 2));
  const lip = new THREE.TorusGeometry(rimR - 0.006, 0.013, 6, low ? 18 : 28);
  bins.add('rim', lip, M(face, 0, 0, 0, Math.PI / 2, 0));
  const hubR = 0.065;
  const spoke = (phi, len0, len1, width, depth = 0.03, dx = 0) => {
    const rc = (len0 + len1) / 2;
    bins.add('rim', PRIM.box, M(face + dx, Math.cos(phi) * rc, Math.sin(phi) * rc, phi, 0, 0, depth, len1 - len0, width));
  };
  const style = cfg.rims;
  if (style === 'y5') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      spoke(a, hubR, rimR * 0.55, 0.055);
      spoke(a + 0.2, rimR * 0.5, rimR, 0.035);
      spoke(a - 0.2, rimR * 0.5, rimR, 0.035);
    }
  } else if (style === 'twin5') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      spoke(a + 0.09, hubR, rimR, 0.03);
      spoke(a - 0.09, hubR, rimR, 0.03);
    }
  } else if (style === 'multi') {
    for (let i = 0; i < 10; i++) spoke((i / 10) * Math.PI * 2, hubR, rimR, 0.026);
  } else if (style === 'offroad') {
    for (let i = 0; i < 6; i++) spoke((i / 6) * Math.PI * 2, hubR, rimR, 0.075, 0.045);
    bins.add('rim', new THREE.TorusGeometry(rimR * 0.92, 0.02, 6, 24), M(face + 0.01, 0, 0, 0, Math.PI / 2, 0));
  } else if (style === 'steel') {
    const disc = new THREE.CylinderGeometry(rimR, rimR, 0.02, 24);
    bins.add('rim', disc, M(face - 0.02, 0, 0, 0, 0, Math.PI / 2));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bins.add('dark', PRIM.cyl8, M(face - 0.005, Math.cos(a) * rimR * 0.6, Math.sin(a) * rimR * 0.6, 0, 0, Math.PI / 2, 0.08, 0.012, 0.08));
    }
  } else if (style === 'turbine') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rc = (hubR + rimR) / 2;
      bins.add('rim', PRIM.box, M(face, Math.cos(a) * rc, Math.sin(a) * rc, a, 0.35, 0, 0.02, rimR - hubR, 0.05, 'XYZ'));
    }
    bins.add('accent', new THREE.TorusGeometry(rimR * 0.45, 0.01, 6, 24), M(face + 0.012, 0, 0, 0, Math.PI / 2, 0));
  }
  const cap = new THREE.CylinderGeometry(hubR, hubR * 1.1, 0.04, 14);
  bins.add('rim', cap, M(face + 0.005, 0, 0, 0, 0, Math.PI / 2));

  // Static brake assembly (does not spin)
  const brake = new Bins();
  brake.add('disc', new THREE.CylinderGeometry(rimR * 0.8, rimR * 0.8, 0.028, low ? 14 : 22), M(face - 0.075, 0, 0, 0, 0, Math.PI / 2));
  brake.add('caliper', PRIM.box, M(face - 0.05, rimR * 0.5, -rimR * 0.38, 0.65, 0, 0, 0.055, 0.1, 0.17));
  return { tire, rimBins: bins, brakeBins: brake, rimR };
}

// ───────────────────────── body ─────────────────────────
export function buildVehicleModel(cfg, opts = {}) {
  const physical = opts.physical !== false;
  const low = !!opts.lowDetail;
  const paintSpec = opts.paint || cfg.paint;
  const d = cfg.dims, L = d.L, W = d.W, hw = W / 2, H = d.H, gc = d.gc, belt = d.belt, hood = d.hood, deck = d.deck;
  const type = cfg.type;
  const boxy = type === 'suv' || type === 'pickup';
  const sporty = type === 'sports' || type === 'hyper' || type === 'coupe';
  const twoDoor = type === 'coupe' || type === 'sports' || type === 'hyper';
  const sh = shared(physical);

  const mats = {
    ...sh,
    paint: makePaint(paintSpec.color, paintSpec.finish, physical),
    rimMat: new THREE.MeshStandardMaterial({ color: cfg.rimColor, metalness: 0.85, roughness: 0.28 }),
    caliper: new THREE.MeshStandardMaterial({ color: cfg.caliper, metalness: 0.3, roughness: 0.4 }),
    seat: new THREE.MeshStandardMaterial({ color: cfg.seat, metalness: 0.05, roughness: 0.75 }),
    head: new THREE.MeshStandardMaterial({ color: 0xdfe8ff, emissive: 0xd8e6ff, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.1 }),
    drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: cfg.type === 'hyper' ? 0x55f2ff : 0xeaf2ff, emissiveIntensity: 1.6 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x3a0006, emissive: 0xff1428, emissiveIntensity: 0.7, roughness: 0.2 }),
    rev: new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0.08 }),
    plate: new THREE.MeshStandardMaterial({ map: plateTexture(`${cfg.plate} ${String(cfg.id.length * 137 + 2026).slice(-3)}`), roughness: 0.5 }),
  };
  mats.roof = cfg.roof === 'body' ? mats.paint : cfg.roof === 'carbon' ? sh.carbon : sh.gloss;
  mats.rim = mats.rimMat;
  mats.dark = sh.gloss;
  mats.accent = mats.drl;

  const zf = L / 2, zr = -L / 2;
  const cab = cfg.cabin;
  const zws = cab.ws * L, zre = cab.re * L, zrr = cab.rr * L;
  // keep the windshield properly raked whatever the config says
  const rake = boxy ? 1.0 : type === 'sports' || type === 'hyper' ? 1.8 : 1.45;
  const zrf = Math.max(zrr + 0.3, Math.min(cab.rf * L, zws - (H - belt) * rake));
  const zbed = type === 'pickup' ? cab.bed * L : null;
  const zB = lerp(zrf, zrr, twoDoor ? 0.92 : boxy ? 0.42 : 0.5);

  // ── lower body keys
  const noseDrop = boxy ? 0.06 : type === 'hyper' ? 0.2 : type === 'sports' ? 0.15 : 0.11;
  const nosePinch = boxy ? 0.94 : type === 'hyper' ? 0.78 : sporty ? 0.84 : 0.87;
  const keys = [];
  const bodyN = Math.min(9, Math.max(4.2, cfg.n * 1.55));
  const k = (z, w, yb, yt, lock = false) => keys.push({ z, hw: w * hw, yb, yt, n: bodyN, ts: 1, lock });
  if (type === 'pickup') {
    const floor = gc + 0.38;
    k(zr, 0.96, gc + 0.07, floor - 0.02);
    k(zr + 0.05, 0.985, gc + 0.02, floor);
    k(zr + 0.2, 1, gc, floor);
    k(zbed - 0.02, 1, gc, floor, true);
    k(zbed + 0.02, 1, gc, belt, true);
  } else {
    const tailPinch = boxy ? 0.95 : sporty ? 0.9 : 0.93;
    k(zr, tailPinch, gc + (boxy ? 0.06 : 0.1), deck - (boxy ? 0.05 : 0.06));
    k(zr + 0.06, 0.98, gc + 0.03, deck - 0.015);
    k(zr + 0.2, 1, gc, deck);
    if (zre > zr + 0.3) k(zre, 1, gc, deck);
  }
  k(zws, 1, gc, belt - 0.01);
  k(lerp(zws, zf, 0.5), 1, gc, lerp(belt, hood, 0.72));
  k(zf - 0.24, 0.985, gc + 0.01, hood + 0.005);
  k(zf - 0.07, 0.955, gc + 0.04, hood - noseDrop * 0.45);
  k(zf, nosePinch, gc + (boxy ? 0.07 : 0.11), hood - noseDrop);
  const body = densify(keys, 46, 2);
  // axle positions (needed for fender bulges and wheels)
  const fo = { sedan: 0.9, coupe: 0.92, suv: 0.86, pickup: 0.9, hatch: 0.88, sports: 0.95, hyper: 1.02 }[type];
  const zFA = zf - fo, zRA = zFA - d.wb;
  // muscular fenders: widen the body over each axle, pinch slightly at the doors
  const bulge = boxy ? 0.012 : sporty ? 0.05 : 0.032;
  for (const st of body) {
    const g = Math.exp(-(((st.z - zFA) / 0.62) ** 2)) + Math.exp(-(((st.z - zRA) / 0.62) ** 2)) * (sporty ? 1.25 : 1);
    st.hw *= 1 + bulge * (g - 0.45);
  }
  const S = body.length;
  const front = body[S - 1], rear = body[0];

  const bins = new Bins();
  const clsBody = ({ z, py }) => {
    if (py < -0.8) return 'under';
    if (type === 'pickup' && z < zbed - 0.025 && py > 0.55) return 'trim';
    if (cfg.cladding && py < -0.45) return 'trim';
    return 'paint';
  };
  bins.addMap(loftKeyed(body, SEGS, clsBody, { front: 'paint', rear: 'paint' }));

  const bodyTop = (z) => stationAt(body, z).yt;
  const sideX = (z, y) => extentX(stationAt(body, z), y);
  const frontZ = (x, y) => {
    x = Math.abs(x);
    for (let i = S - 1; i >= 0; i--) {
      if (extentX(body[i], y) >= x) {
        if (i === S - 1) return body[i].z;
        const ea = extentX(body[i], y), eb = extentX(body[i + 1], y);
        const t = (ea - x) / (ea - eb || 1);
        return lerp(body[i].z, body[i + 1].z, Math.min(1, Math.max(0, t)));
      }
    }
    return zf;
  };
  const rearZ = (x, y) => {
    x = Math.abs(x);
    for (let i = 0; i < S; i++) {
      if (extentX(body[i], y) >= x) {
        if (i === 0) return body[0].z;
        const ea = extentX(body[i], y), eb = extentX(body[i - 1], y);
        const t = (ea - x) / (ea - eb || 1);
        return lerp(body[i].z, body[i - 1].z, Math.min(1, Math.max(0, t)));
      }
    }
    return zr;
  };

  /** Box glued to the front (dir=1) or rear (dir=-1) surface between x0..x1 at height y. */
  const facePiece = (key, dir, x0, x1, y, h, depth = 0.06, protrude = 0.006, mirror = false, geo = PRIM.box, tilt = 0) => {
    const zf0 = dir > 0 ? frontZ(x0, y) : rearZ(x0, y);
    const zf1 = dir > 0 ? frontZ(x1, y) : rearZ(x1, y);
    const dx = x1 - x0, dz = zf1 - zf0;
    const th = Math.atan2(-dz, dx);
    const nx = Math.sin(th) * dir, nz = Math.cos(th) * dir;
    const off = protrude - depth / 2;
    const cx = (x0 + x1) / 2 + nx * off, cz = (zf0 + zf1) / 2 + nz * off;
    bins.add(key, geo, M(cx, y, cz, 0, th, tilt, Math.hypot(dx, dz), h, depth, 'YXZ'), mirror);
    return { x: (x0 + x1) / 2, y, z: (zf0 + zf1) / 2 };
  };
  /** Box glued to the left side (mirrored to the right) between z0..z1 at height y. */
  const sidePiece = (key, z0, z1, y, h, depth = 0.03, protrude = 0.004, mirror = true) => {
    const x0 = sideX(z0, y), x1 = sideX(z1, y);
    const th = Math.atan2(x1 - x0, z1 - z0);
    const nx = Math.cos(th), nz = -Math.sin(th);
    const off = protrude - depth / 2;
    const cx = (x0 + x1) / 2 + nx * off, cz = (z0 + z1) / 2 + nz * off;
    bins.add(key, PRIM.box, M(cx, y, cz, 0, th, 0, depth, h, Math.hypot(x1 - x0, z1 - z0)), mirror);
  };

  // ── greenhouse
  const cabKeys = [
    { z: zre - 0.03, yt: bodyTop(zre) + 0.012 },
    { z: lerp(zrr, zre, 0.5), yt: lerp(H, bodyTop(zre), boxy ? 0.42 : 0.5) },
    { z: zrr, yt: H - 0.022 },
    { z: (zrf + zrr) / 2, yt: H },
    { z: zrf, yt: H - 0.022 },
    { z: lerp(zws, zrf, 0.5), yt: lerp(bodyTop(zws), H, boxy ? 0.6 : 0.56) },
    { z: zws + 0.03, yt: bodyTop(zws) + 0.012 },
  ].map((s) => ({ ...s, hw: 0, yb: 0, n: 4, ts: 1 }));
  const cabN = Math.min(7, Math.max(3.4, cfg.n * 1.1));
  const cabin = densify(cabKeys, 30, 1).map((s) => {
    const c = bodyTop(s.z) - 0.07;
    const hh = Math.max(0.03, s.yt - c);
    const ex = sideX(s.z, c);
    return { z: s.z, hw: Math.max(0.05, ex - 0.035), yb: c - hh, yt: c + hh, n: cabN, ts: cfg.tumble };
  });
  const roofZ0 = zrr + 0.03, roofZ1 = zrf - 0.03;
  const trimKey = ['amg-c', 'cruiser-300', 'accord-x', 'corolla-x', 'x5-aura', 'city-x'].includes(cfg.id) ? 'chrome' : 'gloss';
  const cKey = boxy ? 'gloss' : 'paint';
  const clsCab = ({ z, py }) => {
    if (py < -0.05) return null;
    if (py < 0.1) return trimKey; // window-line trim along the belt
    const inRoof = z > roofZ0 && z < roofZ1;
    if (py > 0.8 && inRoof) return 'roof';
    if (py > 0.68 && py <= 0.8 && inRoof) return trimKey;
    if (py > 0.55 && py <= 0.8 && z >= roofZ1) return 'gloss'; // A-pillars
    if (py <= 0.68) {
      if (Math.abs(z - zB) < 0.05) return 'gloss'; // B-pillar
      if (boxy && type === 'suv' && Math.abs(z - lerp(zB, zrr, 0.62)) < 0.04) return 'gloss';
      if (z < zrr + (boxy ? 0.02 : 0.12)) return cKey; // C/D-pillar
    }
    return 'glass';
  };
  bins.addMap(loftKeyed(cabin, SEGS, clsCab, { front: null, rear: null }));

  // ── wheels & arches
  const tireW = boxy ? 0.27 : sporty ? 0.285 : 0.245;
  const wheelAt = [];
  for (const [zA, isFront] of [[zFA, true], [zRA, false]]) {
    // body side at the wheel (measured just above the sill on tall SUVs / pickups)
    const ex = sideX(zA, Math.max(d.r, gc + 0.14));
    const wx = ex + 0.045 - tireW / 2 + (sporty && !isFront ? 0.015 : 0);
    wheelAt.push({ z: zA, x: wx, front: isFront });
    const R = d.r + (boxy ? 0.075 : 0.055);
    const alpha = Math.asin(Math.min(0.95, Math.max(0, (d.r - gc) / R)));
    const disc = new THREE.CircleGeometry(R, 24, -alpha, Math.PI + 2 * alpha);
    bins.add('arch', disc, M(ex + 0.004, d.r, zA, 0, Math.PI / 2, 0), true);
    if (cfg.cladding) {
      const tube = 0.055;
      const flare = new THREE.TorusGeometry(R + tube * 0.4, tube, 6, 22, Math.PI + 2 * alpha);
      flare.rotateZ(-alpha);
      bins.add('trim', flare, M(ex - tube * 0.25, d.r, zA, 0, Math.PI / 2, 0, 1, 1, 0.55), true);
      flare.dispose();
    }
    disc.dispose();
  }

  // ── front fascia
  const fy0 = front.yb, fy1 = front.yt;
  const fh = fy1 - fy0;
  const anchors = { head: [], tail: [], exhaust: [], rearWheels: [] };
  const lx = (f) => f * hw * (front.hw / hw);

  const lights = cfg.lights;
  let headY = fy1 - 0.065;
  let headIn = 0.46, headOut = 0.9, headH = 0.07;
  if (lights === 'toyotaSuv') { headH = 0.12; headY = fy1 - 0.09; headIn = 0.5; headOut = 0.93; }
  else if (lights === 'boxy') { headH = 0.16; headY = fy1 - 0.11; headIn = 0.62; headOut = 0.94; }
  else if (lights === 'sharp') { headH = 0.075; headY = fy1 - 0.06; headIn = 0.5; headOut = 0.92; }
  else if (lights === 'bmw') { headH = 0.08; headY = fy1 - 0.065; headIn = 0.52; headOut = 0.9; }
  else if (lights === 'aura') { headH = 0.03; headY = fy1 - 0.03; }

  if (lights === 'round') {
    const zl = frontZ(lx(0.68), hood - 0.03) - 0.06;
    const lamp = new THREE.CylinderGeometry(0.095, 0.1, 0.12, 20);
    bins.add('chrome', lamp, M(lx(0.68), hood - 0.04, zl, Math.PI / 2 - 0.35, 0, 0), true);
    const lens = new THREE.CircleGeometry(0.085, 20);
    bins.add('head', lens, M(lx(0.68), hood - 0.04 + 0.02, zl + 0.062, -0.35, 0, 0), true);
    anchors.head.push(new THREE.Vector3(lx(0.68), hood - 0.04, zl + 0.08), new THREE.Vector3(-lx(0.68), hood - 0.04, zl + 0.08));
    // slim DRL bars in the bumper
    facePiece('drl', 1, lx(0.55), lx(0.8), fy0 + fh * 0.45, 0.02, 0.03, 0.008, true);
  } else if (lights === 'aura') {
    facePiece('drl', 1, -lx(0.88), lx(0.88), headY, headH, 0.04, 0.01);
    facePiece('gloss', 1, lx(0.62), lx(0.92), headY - 0.06, 0.06, 0.05, 0.004, true);
    facePiece('head', 1, lx(0.7), lx(0.86), headY - 0.06, 0.035, 0.04, 0.008, true);
    anchors.head.push(new THREE.Vector3(lx(0.78), headY - 0.06, zf), new THREE.Vector3(-lx(0.78), headY - 0.06, zf));
  } else {
    const a = facePiece('gloss', 1, lx(headIn), lx(headOut), headY, headH, 0.07, 0.005, true, PRIM.box, lights === 'sharp' ? -0.1 : 0);
    facePiece('head', 1, lx(headIn + 0.06), lx(headOut - 0.05), headY, headH * 0.55, 0.05, 0.009, true);
    if (lights === 'bmw') {
      facePiece('drl', 1, lx(headIn + 0.06), lx(headIn + 0.075), headY, headH * 0.85, 0.04, 0.012, true);
      facePiece('drl', 1, lx(headOut - 0.16), lx(headOut - 0.145), headY, headH * 0.85, 0.04, 0.012, true);
    } else if (lights === 'toyotaSuv' || lights === 'boxy') {
      facePiece('drl', 1, lx(headIn + 0.02), lx(headOut - 0.02), headY - headH * 0.42, 0.016, 0.04, 0.012, true);
    } else {
      facePiece('drl', 1, lx(headIn + 0.02), lx(headOut - 0.01), headY + headH * 0.42, 0.014, 0.04, 0.012, true);
    }
    anchors.head.push(new THREE.Vector3(a.x, headY, a.z + 0.02), new THREE.Vector3(-a.x, headY, a.z + 0.02));
  }

  // grilles
  const g = cfg.grille;
  const kidney = (wk, hk, xk, yk, frame = 'chrome') => {
    const outer = extrudeShape(roundedRectShape(wk, hk, Math.min(wk, hk) * 0.32), 0.05);
    const inner = extrudeShape(roundedRectShape(wk - 0.035, hk - 0.035, Math.min(wk, hk) * 0.28), 0.05);
    const z = frontZ(xk + wk / 2, yk);
    bins.add(frame, outer, M(xk, yk, z + 0.002), true);
    bins.add('slats', inner, M(xk, yk, z + 0.012), true);
    outer.dispose();
    inner.dispose();
  };
  const trapezoid = (key, x0, x1, y, h, depth = 0.05, protrude = 0.006) => facePiece(key, 1, x0, x1, y, h, depth, protrude);
  if (g === 'kidneyTall') {
    const hk = Math.min(fh * 0.62, 0.36);
    kidney(0.22 * (W / 1.9), hk, 0.135, fy1 - 0.04 - hk / 2, 'gloss');
    trapezoid('honey', -lx(0.32), lx(0.32), fy0 + 0.08, 0.1);
    facePiece('honey', 1, lx(0.55), lx(0.86), fy0 + 0.13, 0.17, 0.05, 0.006, true);
  } else if (g === 'kidneyWide') {
    const hk = Math.min(fh * 0.42, 0.24);
    kidney(0.3 * (W / 1.95), hk, 0.175, fy1 - 0.035 - hk / 2, cfg.id === 'x5-aura' ? 'drl' : 'chrome');
    trapezoid('honey', -lx(0.4), lx(0.4), fy0 + 0.09, 0.11);
    facePiece('honey', 1, lx(0.56), lx(0.88), fy0 + 0.12, 0.16, 0.05, 0.006, true);
  } else if (g === 'toyotaBig') {
    const hgr = fh * 0.56;
    const yg = fy1 - 0.05 - hgr / 2;
    const frame = cfg.id === 'hilux-revo' ? 'gloss' : 'chrome';
    trapezoid(frame, -lx(headIn - 0.02), lx(headIn - 0.02), yg, hgr, 0.05, 0.006);
    trapezoid(cfg.id === 'hilux-revo' ? 'honey' : 'slats', -lx(headIn - 0.06), lx(headIn - 0.06), yg, hgr - 0.05, 0.05, 0.012);
    if (frame === 'chrome') for (let i = 0; i < 3; i++) trapezoid('chrome', -lx(headIn - 0.07), lx(headIn - 0.07), yg - hgr * 0.3 + i * hgr * 0.3, 0.018, 0.03, 0.016);
    else trapezoid('chrome', -lx(headIn - 0.07), lx(headIn - 0.07), yg + hgr * 0.18, 0.03, 0.03, 0.016);
    trapezoid('trim', -lx(0.6), lx(0.6), fy0 + 0.07, 0.1, 0.05, 0.008);
  } else if (g === 'toyotaBar') {
    trapezoid('trim', -lx(headIn - 0.02), lx(headIn - 0.02), headY - 0.02, headH + 0.06, 0.05, 0.006);
    for (let i = 0; i < 3; i++) trapezoid(cfg.id === 'prado-250' ? 'gloss' : 'chrome', -lx(headIn - 0.05), lx(headIn - 0.05), headY - 0.06 + i * 0.045, 0.016, 0.03, 0.012);
    trapezoid('trim', -lx(0.75), lx(0.75), fy0 + 0.1, 0.12, 0.05, 0.01);
  } else if (g === 'toyotaSplit') {
    trapezoid('gloss', -lx(headIn - 0.02), lx(headIn - 0.02), headY + 0.01, 0.06, 0.05, 0.006);
    trapezoid('honey', -lx(0.52), lx(0.52), fy0 + fh * 0.36, fh * 0.42, 0.05, 0.006);
    trapezoid('chrome', -lx(0.5), lx(0.5), fy0 + fh * 0.59, 0.02, 0.03, 0.012);
    facePiece('amber', 1, lx(0.6), lx(0.8), fy0 + fh * 0.22, 0.03, 0.03, 0.01, true);
  } else if (g === 'toyotaSedan') {
    trapezoid('gloss', -lx(headIn - 0.02), lx(headIn - 0.02), headY, 0.035, 0.04, 0.006);
    trapezoid('honey', -lx(0.58), lx(0.58), fy0 + fh * 0.35, fh * 0.4, 0.05, 0.006);
  } else if (g === 'honda' || g === 'hondaWide' || g === 'hondaR') {
    const upperH = g === 'hondaWide' ? 0.11 : 0.06;
    trapezoid(g === 'hondaWide' ? 'honey' : 'gloss', -lx(headIn + 0.01), lx(headIn + 0.01), headY - 0.01, upperH, 0.05, 0.006);
    if (g === 'hondaWide') trapezoid('chrome', -lx(headIn + 0.02), lx(headIn + 0.02), headY + upperH / 2, 0.016, 0.03, 0.012);
    const lowH = g === 'hondaR' ? fh * 0.5 : fh * 0.36;
    trapezoid('honey', -lx(g === 'hondaR' ? 0.62 : 0.5), lx(g === 'hondaR' ? 0.62 : 0.5), fy0 + lowH / 2 + 0.03, lowH, 0.05, 0.006);
    if (g === 'hondaR') facePiece('gloss', 1, lx(0.7), lx(0.9), fy0 + 0.12, 0.14, 0.05, 0.006, true);
  } else if (g === 'diamond') {
    const hgr = fh * 0.55, yg = fy1 - 0.04 - hgr / 2;
    trapezoid('chrome', -lx(headIn - 0.03), lx(headIn - 0.03), yg, hgr, 0.05, 0.004);
    trapezoid('diamond', -lx(headIn - 0.06), lx(headIn - 0.06), yg, hgr - 0.04, 0.05, 0.01);
    trapezoid('chrome', -lx(headIn - 0.06), lx(headIn - 0.06), yg, 0.025, 0.03, 0.016);
    const disc = new THREE.CylinderGeometry(0.075, 0.075, 0.025, 24);
    bins.add('chrome', disc, M(0, yg, frontZ(0, yg) + 0.02, Math.PI / 2, 0, 0));
    disc.dispose();
    trapezoid('honey', -lx(0.5), lx(0.5), fy0 + 0.08, 0.1, 0.05, 0.006);
    facePiece('honey', 1, lx(0.62), lx(0.86), fy0 + 0.12, 0.14, 0.05, 0.006, true);
  } else if (g === 'sport') {
    trapezoid('honey', -lx(0.55), lx(0.55), fy0 + fh * 0.36, fh * 0.48, 0.05, 0.006);
    facePiece('gloss', 1, lx(0.66), lx(0.88), fy0 + fh * 0.32, fh * 0.34, 0.05, 0.006, true);
  } else if (g === 'porsche') {
    trapezoid('gloss', -lx(0.36), lx(0.36), fy0 + fh * 0.32, fh * 0.32, 0.05, 0.006);
    facePiece('gloss', 1, lx(0.5), lx(0.85), fy0 + fh * 0.36, fh * 0.36, 0.05, 0.006, true);
  } else if (g === 'aura') {
    trapezoid('gloss', -lx(0.6), lx(0.6), fy0 + fh * 0.4, fh * 0.5, 0.05, 0.006);
    facePiece('drl', 1, lx(0.12), lx(0.5), fy0 + fh * 0.4, 0.012, 0.03, 0.012, true, PRIM.box, 0.35);
    facePiece('gloss', 1, lx(0.66), lx(0.92), fy0 + fh * 0.35, fh * 0.4, 0.05, 0.006, true);
  }
  if (boxy && g !== 'toyotaSplit') facePiece('drl', 1, lx(0.68), lx(0.82), fy0 + 0.12, 0.035, 0.04, 0.01, true);
  // front plate
  if (cfg.type !== 'hyper') facePiece('plate', 1, -0.26, 0.26, fy0 + Math.min(0.17, fh * 0.32), 0.11, 0.02, 0.018);

  // ── rear
  const ry0 = rear.yb, ry1 = rear.yt, rh = ry1 - ry0;
  const rx = (f) => f * rear.hw;
  const tails = cfg.tails;
  if (boxy) {
    const ty = belt - 0.12;
    const tz = rearZ(rx(0.86), ty);
    facePiece('tail', -1, rx(0.72), rx(0.96), ty, 0.24, 0.06, 0.008, true);
    facePiece('rev', -1, rx(0.74), rx(0.84), ty - 0.15, 0.05, 0.04, 0.01, true);
    anchors.tail.push(new THREE.Vector3(rx(0.84), ty, tz), new THREE.Vector3(-rx(0.84), ty, tz));
    if (type === 'suv') facePiece('chrome', -1, -rx(0.5), rx(0.5), ty, 0.03, 0.03, 0.008);
  } else {
    const ty = ry1 - (tails === 'duck' ? 0.05 : 0.08);
    const th = tails === 'duck' ? 0.05 : 0.085;
    if (tails === 'rings') {
      for (const f of [0.62, 0.84]) {
        const ring = new THREE.TorusGeometry(0.065, 0.02, 8, 20);
        bins.add('tail', ring, M(rx(f), ty - 0.01, rearZ(rx(f), ty) - 0.005, 0, 0, 0), true);
        ring.dispose();
      }
    } else {
      facePiece('tail', -1, rx(0.55), rx(0.95), ty, th, 0.06, 0.008, true);
    }
    if (tails === 'bar') facePiece('tail', -1, -rx(0.55), rx(0.55), ty + th * 0.2, 0.022, 0.04, 0.01);
    facePiece('rev', -1, rx(0.4), rx(0.5), ty - 0.02, 0.03, 0.04, 0.01, true);
    anchors.tail.push(new THREE.Vector3(rx(0.75), ty, rearZ(rx(0.75), ty)), new THREE.Vector3(-rx(0.75), ty, rearZ(rx(0.75), ty)));
  }
  if (type === 'pickup') {
    // bed walls + tailgate + bed rails
    const floor = gc + 0.38;
    const bx = sideX(zbed - 0.3, floor - 0.12) - 0.03;
    const len = zbed - zr - 0.06;
    bins.add('paint', PRIM.box, M(bx, (floor + belt) / 2, zr + 0.06 + len / 2, 0, 0, 0, 0.05, belt - floor, len), true);
    bins.add('trim', PRIM.box, M(bx, belt + 0.01, zr + 0.06 + len / 2, 0, 0, 0, 0.07, 0.025, len), true);
    bins.add('paint', PRIM.box, M(0, (floor - 0.12 + belt) / 2, zr + 0.035, 0, 0, 0, bx * 2 + 0.05, belt - floor + 0.12, 0.05));
    if (cfg.sportsBar) {
      const zb = zbed - 0.28;
      for (const s of [1, -1]) bins.add('gloss', PRIM.cyl8, M(s * bx * 0.85, (belt + H - 0.12) / 2, zb, 0, 0, 0, 0.06, H - 0.12 - belt, 0.06));
      bins.add('gloss', PRIM.box, M(0, H - 0.12, zb, 0, 0, 0, bx * 1.7 + 0.06, 0.06, 0.06));
    }
    facePiece('plate', -1, -0.26, 0.26, gc + 0.16, 0.11, 0.02, 0.02);
    bins.add('trim', PRIM.box, M(0, gc + 0.12, zr - 0.02, 0, 0, 0, W * 0.95, 0.14, 0.12));
  } else {
    facePiece('plate', -1, -0.26, 0.26, ry0 + rh * (boxy ? 0.45 : 0.5), 0.11, 0.02, 0.018);
    facePiece('trim', -1, -rx(0.8), rx(0.8), ry0 + 0.05, 0.1, 0.06, 0.01);
  }
  // exhausts
  const exY = gc + 0.06;
  const exTip = (x) => {
    const z = (type === 'pickup' ? zr : rearZ(x, exY + 0.04)) - 0.02;
    const c = new THREE.CylinderGeometry(0.042, 0.045, 0.14, 12, 1, true);
    bins.add(cfg.exhaust === 'center' ? 'gloss' : 'chrome', c, M(x, exY, z + 0.03, Math.PI / 2, 0, 0));
    c.dispose();
    anchors.exhaust.push(new THREE.Vector3(x, exY, z - 0.04));
  };
  if (cfg.exhaust === 'dual') { exTip(rx(0.6)); exTip(-rx(0.6)); }
  else if (cfg.exhaust === 'quad') for (const x of [0.5, 0.66, -0.5, -0.66]) exTip(rx(x));
  else if (cfg.exhaust === 'triple') for (const x of [-0.1, 0, 0.1]) exTip(x);
  else if (cfg.exhaust === 'center') for (const x of [-0.09, 0.09]) exTip(x);

  // ── sides
  const zMirror = zws - 0.16;
  const yMirror = belt + 0.1;
  const mx = sideX(zMirror, belt - 0.02) + 0.1;
  bins.add(sporty || cfg.brand === 'BMW' ? 'gloss' : 'paint', PRIM.box, M(mx, yMirror, zMirror, 0, -0.12, 0, 0.17, 0.11, 0.09), true);
  bins.add('trim', PRIM.box, M(mx - 0.08, yMirror - 0.03, zMirror + 0.01, 0, 0, 0, 0.1, 0.03, 0.05), true);
  const handleY = belt - 0.09;
  const handleKey = trimKey === 'chrome' ? 'chrome' : 'paint';
  sidePiece(handleKey, zws - 0.72, zws - 0.6, handleY, 0.025, 0.03, 0.012);
  if (!twoDoor) sidePiece(handleKey, zB - 0.52, zB - 0.4, handleY, 0.025, 0.03, 0.012);
  // door seams
  const seamH = (belt - gc) * 0.62, seamY = (gc + belt) / 2 + 0.03;
  const seam = (z) => sidePiece('under', z - 0.003, z + 0.003, seamY, seamH, 0.012, 0.002);
  seam(zws - 0.02);
  seam(zB);
  if (!twoDoor) seam(type === 'pickup' ? zbed + 0.05 : Math.max(zrr - 0.05, zRA + d.r + 0.08));
  if (sporty || cfg.brand === 'BMW' || cfg.id === 'typer-fl5') {
    sidePiece(cfg.cladding ? 'trim' : 'gloss', zRA + d.r + 0.12, zFA - d.r - 0.12, gc + 0.05, 0.07, 0.04, 0.012);
    sidePiece('gloss', zFA - d.r - 0.32, zFA - d.r - 0.12, d.r + 0.2, 0.07, 0.03, 0.006);
  }
  if (cfg.cladding) sidePiece('trim', zRA + d.r + 0.1, zFA - d.r - 0.1, gc + 0.07, 0.12, 0.04, 0.012);

  // ── roof extras
  const roofHW = extentX(stationAt(cabin, (zrf + zrr) / 2), H - 0.04);
  if (cfg.rails) {
    const len = (zrf - zrr) * 0.88, zc = (zrf + zrr) / 2;
    bins.add(cfg.id === 'cruiser-300' ? 'chrome' : 'trim', PRIM.box, M(roofHW * 0.82, H + 0.04, zc, 0, 0, 0, 0.035, 0.03, len), true);
    for (const t of [-0.45, 0.45]) bins.add('trim', PRIM.box, M(roofHW * 0.82, H + 0.015, zc + t * len, 0, 0, 0, 0.035, 0.03, 0.06), true);
  }
  if (cfg.sunroof) {
    const len = (zrf - zrr) * 0.62;
    bins.add('gloss', PRIM.box, M(0, H - 0.001, (zrf + zrr) / 2 + 0.05, 0, 0, 0, roofHW * 1.15, 0.012, len));
  }
  bins.add(cfg.roof === 'body' ? 'paint' : 'gloss', PRIM.box, M(0, H + 0.025, zrr + 0.12, -0.2, 0, 0, 0.05, 0.05, 0.16));

  // ── spoilers
  if (cfg.spoiler === 'wing') {
    const wy = deck + (type === 'hyper' ? 0.3 : 0.24);
    const wz = zr + 0.28;
    const span = W * (type === 'hatch' ? 0.82 : 0.86);
    bins.add('carbon', PRIM.box, M(0, wy, wz, -0.06, 0, 0, span, 0.03, 0.3));
    for (const s of [1, -1]) {
      bins.add('carbon', PRIM.box, M(s * span / 2, wy - 0.02, wz, 0, 0, 0, 0.02, 0.12, 0.34));
      bins.add('gloss', PRIM.box, M(s * span * 0.3, (wy + bodyTop(wz)) / 2, wz + 0.02, 0, 0, 0, 0.025, wy - bodyTop(wz), 0.08));
    }
  } else if (cfg.spoiler === 'duck') {
    const z = zr + 0.12;
    bins.add('paint', PRIM.box, M(0, bodyTop(z) + 0.02, z, 0.35, 0, 0, rear.hw * 1.7, 0.03, 0.18));
  } else if (cfg.spoiler === 'lip') {
    const z = zr + 0.1;
    bins.add('carbon', PRIM.box, M(0, bodyTop(z) + 0.012, z, 0.25, 0, 0, rear.hw * 1.6, 0.018, 0.08));
  }
  if (type === 'hyper') {
    // glowing side blades + intake
    sidePiece('drl', -0.2, zFA - d.r - 0.15, d.r + 0.12, 0.012, 0.02, 0.008);
    bins.add('gloss', PRIM.box, M(0, H + 0.05, zrr - 0.15, 0, 0, 0, 0.3, 0.12, 0.5));
  }

  // ── interior
  const interior = new Bins();
  const dIn = W / 1.85;
  const floorY = gc + 0.12;
  const seatZ = twoDoor ? lerp(zrf, zrr, 0.62) : zB + 0.12;
  const seatY = floorY + (boxy ? 0.38 : 0.26);
  const driverX = -0.37 * dIn; // right-hand drive, as in Pakistan
  interior.add('interior', PRIM.box, M(0, belt - 0.02, zws - 0.32, 0, 0, 0, W * 0.82, 0.18, 0.42));
  interior.add('interior', PRIM.box, M(0, (floorY + belt) / 2 - 0.08, seatZ + 0.35, 0, 0, 0, 0.22, belt - floorY - 0.2, 0.7));
  const roofHWi = extentX(stationAt(cabin, (zrf + zrr) / 2), H - 0.08);
  // keep every seat below the glass at its position
  const roofAt = (z) => (z > zws || z < zre ? 0 : stationAt(cabin, z).yt) - 0.1;
  const backH = Math.max(0.3, Math.min(0.66, roofAt(seatZ - 0.36) - seatY - 0.22));
  for (const x of [driverX, -driverX]) {
    interior.add('seat', PRIM.box, M(x, seatY, seatZ, 0, 0, 0, 0.5, 0.12, 0.5));
    interior.add('seat', PRIM.box, M(x, seatY + 0.06 + backH / 2, seatZ - 0.27, -0.22, 0, 0, 0.48, backH, 0.12));
    if (backH > 0.6) interior.add('seat', PRIM.box, M(x, seatY + 0.76, seatZ - 0.36, -0.22, 0, 0, 0.26, 0.16, 0.1));
  }
  if (!twoDoor && type !== 'pickup' || (type === 'pickup' && zrr < -0.3)) {
    const rz = seatZ - 0.85;
    const rH = Math.min(0.6, roofAt(rz - 0.3) - seatY - 0.1);
    if (rz > zre + 0.25 && rH > 0.25) {
      interior.add('seat', PRIM.box, M(0, seatY, rz, 0, 0, 0, W * 0.72, 0.12, 0.46));
      interior.add('seat', PRIM.box, M(0, seatY + rH / 2, rz - 0.24, -0.18, 0, 0, W * 0.72, rH, 0.12));
    }
  }
  // headliner so the cockpit view sees a dark roof lining instead of the paint's back face
  interior.add('interior', PRIM.box, M(0, H - 0.07, (zrf + zrr) / 2, 0, 0, 0, roofHWi * 1.75, 0.02, Math.max(0.3, zrf - zrr) * 0.98));
  const interiorMesh = interior.build(mats, { castShadow: false });

  // steering wheel
  const steerPivot = new THREE.Group();
  steerPivot.position.set(driverX, belt + 0.02, zws - 0.5);
  steerPivot.rotation.x = 0.4;
  const steerSpin = new THREE.Group();
  steerPivot.add(steerSpin);
  const sw = new Bins();
  sw.add('gloss', new THREE.TorusGeometry(0.17, 0.02, 8, 26));
  sw.add('gloss', PRIM.box, M(0, -0.07, 0, 0, 0, 0, 0.04, 0.15, 0.03));
  sw.add('gloss', PRIM.box, M(0, 0, 0, 0, 0, 0, 0.32, 0.035, 0.03));
  sw.add('seat', PRIM.cyl, M(0, 0, 0, Math.PI / 2, 0, 0, 0.11, 0.04, 0.11));
  steerSpin.add(sw.build(mats, { castShadow: false }));

  // ── assemble
  const root = new THREE.Group();
  root.name = cfg.id;
  const rollCenter = gc + 0.25;
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = rollCenter;
  const bodyInner = new THREE.Group();
  bodyInner.position.y = -rollCenter;
  bodyPivot.add(bodyInner);
  root.add(bodyPivot);
  const shell = bins.build(mats, { castShadow: true, shadowKeys: ['paint', 'trim', 'gloss', 'roof', 'glass', 'under'] });
  bodyInner.add(shell, interiorMesh, steerPivot);

  // wheels
  const wg = wheelGeometries(cfg, tireW, low);
  const rimGeo = mergeOneKeyed(wg.rimBins, mats);
  const brakeGroup = low ? null : wg.brakeBins.build(mats, { castShadow: false });
  const wheels = [];
  for (const wa of wheelAt) {
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * wa.x, d.r, wa.z);
      const spin = new THREE.Group();
      pivot.add(spin);
      const mir = new THREE.Group();
      mir.scale.x = side;
      spin.add(mir);
      const tire = new THREE.Mesh(wg.tire, mats.rubber);
      tire.castShadow = true;
      mir.add(tire);
      for (const m of rimGeo) mir.add(new THREE.Mesh(m.geometry, m.material));
      if (brakeGroup) {
        const b = brakeGroup.clone();
        b.scale.x = side;
        pivot.add(b);
      }
      root.add(pivot);
      wheels.push({ pivot, spin, front: wa.front, side, x: side * wa.x, z: wa.z });
      if (!wa.front) anchors.rearWheels.push(new THREE.Vector3(side * wa.x, 0, wa.z));
    }
  }

  // contact shadow
  const blobMat = new THREE.MeshBasicMaterial({
    map: blobShadowTexture(), color: 0x000000, transparent: true, opacity: opts.shadowMaps ? 0.42 : 0.7,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
  });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.32, L * 1.14), blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  blob.renderOrder = 1;
  root.add(blob);

  const eye = new THREE.Vector3(driverX, Math.min(H - 0.12, seatY + 0.78), seatZ - 0.06);
  anchors.cockpit = eye;
  anchors.hood = new THREE.Vector3(0, belt + 0.16, zws + 0.12);
  anchors.mirror = new THREE.Vector3(mx, yMirror, zMirror);

  const model = {
    cfg, root, bodyPivot, bodyInner, wheels, steerSpin, mats, anchors, blob,
    dims: { L, W, H, wb: d.wb, r: d.r, zFA, zRA, rollCenter },
    dispose() {
      root.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        }
      });
      for (const key of ['paint', 'rimMat', 'caliper', 'seat', 'head', 'drl', 'tail', 'plate', 'rev']) mats[key].dispose();
      blobMat.dispose();
    },
  };
  if (opts.ghost) applyGhost(model);
  return model;
}

/** Merge a Bins object into geometry+material pairs that can be shared by several meshes. */
function mergeOneKeyed(bins, mats) {
  const out = [];
  for (const [key, list] of bins.map) {
    const geo = mergeGeometries(list);
    for (const gg of list) gg.dispose();
    out.push({ geometry: geo, material: mats[key] });
  }
  bins.map.clear();
  return out;
}

const ghostMat = new THREE.MeshBasicMaterial({ color: 0x55e6ff, transparent: true, opacity: 0.22, depthWrite: false });
ghostMat.userData.shared = true;

function applyGhost(model) {
  model.root.traverse((o) => {
    if (o.isMesh) {
      o.material = ghostMat;
      o.castShadow = false;
    }
  });
  model.blob.visible = false;
}
