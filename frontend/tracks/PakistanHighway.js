// Track A — Pakistan Highway: a divided motorway ring through Punjab-style farmland, with green
// bilingual signs, a river with two bridges, an overpass, a village, a mosque and distant hills.
import * as THREE from 'three';
import { fbm, noise2, smoothstep, lerp, nextFrame } from '../game/utils.js';
import {
  treeGeometry, vegMaterial, scatter, alongRoad, mat4, motorwaySign, billboard, mountainRing, concreteMaterial,
} from './scenery.js';

const riverZ = (x) => 300 + 40 * Math.sin(x / 150);
const nearRiver = (x, z, m = 0) => Math.abs(z - riverZ(x)) < 34 + m;

const FIELD = ['#5f7f2e', '#7aa23a', '#c4ac3c', '#8a6c44', '#46682a', '#93a64a'].map((c) => new THREE.Color(c));
const _c = new THREE.Color();

export default {
  id: 'pakistan-highway',
  name: 'Pakistan Highway',
  subtitle: 'Aura Motorway • Punjab',
  description: 'Fast sweeping motorway through wheat and mustard fields, across the river and under the overpass. Flat out — use the slipstream of the trucks.',
  difficulty: 'Easy',
  seed: 21,
  accent: '#3ddc84',
  points: [
    [0, 0, 2], [10, 320, 4], [90, 620, 10], [300, 820, 16], [600, 860, 14], [860, 720, 8], [960, 450, 3],
    [900, 180, 2], [960, -120, 4], [860, -400, 8], [600, -540, 10], [300, -520, 6], [90, -330, 3],
  ],
  road: {
    halfWidth: 7, lanes: 3, shoulder: 3, shoulderKind: 'concrete', shoulderIsRoad: true,
    base: '#3c3e42', edge: '#f4f4f0', lane: '#f4f4f0', skirt: '#7d776c',
  },
  wall: { kind: 'guardrail' },
  extraRight: 22.5,
  oppositeRoad: { median: 6, width: 14, lanes: 3, medianKind: 'grass' },
  traffic: true,
  sprint: { start: 0.08, length: 0.86 },
  gateText: 'AURA MOTORWAY',
  gateColor: '#3ddc84',
  env: {
    night: false,
    skyTop: '#2b6fd6', skyHorizon: '#cfe3f3', skyBottom: '#dfe8ee',
    sunDir: [0.42, 0.78, 0.46], sunColor: '#fff2dc', sunIntensity: 2.9,
    hemiSky: '#c4dcff', hemiGround: '#6f6243', hemiIntensity: 0.9,
    fog: '#cddff0', fogNear: 300, fogFar: 3000, exposure: 1.0,
    bloom: { strength: 0.25, threshold: 0.92, radius: 0.35 },
    clouds: true, ambience: 'highway',
  },
  terrain: {
    margin: 650,
    blend: 50,
    detail: 'grass',
    verge: [0.42, 0.5, 0.26],
    water: { level: -2.6, color: '#3d6b6a', roughness: 0.12 },
    bridgeZone: (x, z) => nearRiver(x, z, 30),
    height(x, z) {
      let h = 7 * fbm(x / 260, z / 260, 4, 2) + 14 * fbm(x / 800, z / 800, 3, 5) + 1;
      const dc = Math.hypot(x - 480, z - 160);
      h += smoothstep(1250, 2300, dc) * (90 + 140 * (0.5 + 0.5 * fbm(x / 400, z / 400, 3, 8)));
      h = Math.max(h, -1.2);
      const dr = Math.abs(z - riverZ(x));
      h = lerp(h, -7, 1 - smoothstep(16, 36, dr));
      return h;
    },
    color(x, z, h, info, out) {
      const fx = Math.floor(x / 70 + 0.35 * noise2(x / 120, z / 120, 4));
      const fz = Math.floor(z / 52 + 0.35 * noise2(x / 140, z / 90, 6));
      const k = (((fx * 73856093) ^ (fz * 19349663)) >>> 0) % FIELD.length;
      _c.copy(FIELD[k]);
      const v = 0.9 + 0.14 * noise2(x / 9, z / 9, 3);
      _c.multiplyScalar(v);
      // furrows / paths between fields
      const ux = (x / 70 + 0.35 * noise2(x / 120, z / 120, 4)) % 1, uz = (z / 52 + 0.35 * noise2(x / 140, z / 90, 6)) % 1;
      if (Math.abs(ux) < 0.035 || Math.abs(uz) < 0.04) _c.set('#9a8664');
      if (h < -0.5) _c.lerp(new THREE.Color('#7b6c50'), smoothstep(-0.5, -3, h));
      if (h > 30) _c.lerp(new THREE.Color('#857d6e'), smoothstep(30, 90, h));
      out[0] = _c.r;
      out[1] = _c.g;
      out[2] = _c.b;
    },
  },

  async scenery(ctx) {
    const t = ctx.track;
    const veg = vegMaterial();
    const shadows = ctx.quality.shadows > 0;

    // Eucalyptus rows planted along the motorway
    const rows = [];
    alongRoad(ctx, 14, [-(t.wallD + 9), t.wallD + t.extraRight + 9], (p) => {
      if (ctx.rng() > 0.55 + ctx.density * 0.4) return;
      const x = p.x + (ctx.rng() - 0.5) * 3, z = p.z + (ctx.rng() - 0.5) * 3;
      if (nearRiver(x, z, 4) || ctx.clearance(x, z) < 6) return;
      const s = 0.8 + ctx.rng() * 0.5;
      rows.push(mat4(x, ctx.height(x, z), z, ctx.rng() * 6, s, s * (0.9 + ctx.rng() * 0.3), s));
    });
    ctx.instanced(treeGeometry('eucalyptus'), veg, rows, { cast: shadows });
    // Farmland trees
    const trees = scatter(ctx, Math.round(650 * ctx.density), { minClear: 18, maxClear: 650, scale: [0.8, 1.5], avoid: (x, z) => nearRiver(x, z, 6), minH: -1 });
    ctx.instanced(treeGeometry('broadleaf'), veg, trees);
    const bushes = scatter(ctx, Math.round(260 * ctx.density), { minClear: 12, maxClear: 300, scale: [1, 2], minH: -3 });
    ctx.instanced(treeGeometry('shrub'), veg, bushes);
    await nextFrame();

    // Villages: brick and plaster houses with rooftop water tanks
    const houses = [], cols = [], tanks = [];
    const brick = ['#b8754a', '#c98b5a', '#d8c5a2', '#e3dccb', '#a9b59a'];
    const centers = scatter(ctx, 8, { minClear: 70, maxClear: 320, avoid: (x, z) => nearRiver(x, z, 40), minH: 0 });
    for (const c of centers) {
      const cx = c.elements[12], cz = c.elements[14];
      const n = 6 + Math.floor(ctx.rng() * 8 * ctx.density + 2);
      for (let i = 0; i < n; i++) {
        const x = cx + (ctx.rng() - 0.5) * 70, z = cz + (ctx.rng() - 0.5) * 70;
        if (ctx.clearance(x, z) < 30 || nearRiver(x, z, 10)) continue;
        const w = 6 + ctx.rng() * 6, h = 3.4 + Math.floor(ctx.rng() * 2) * 3, d = 6 + ctx.rng() * 6;
        const y = ctx.height(x, z);
        const yaw = Math.floor(ctx.rng() * 4) * (Math.PI / 2) + (ctx.rng() - 0.5) * 0.2;
        houses.push(mat4(x, y + h / 2 - 0.3, z, yaw, w, h, d));
        cols.push(new THREE.Color(brick[Math.floor(ctx.rng() * brick.length)]));
        if (ctx.rng() < 0.7) tanks.push(mat4(x + (ctx.rng() - 0.5) * w * 0.5, y + h + 0.5, z + (ctx.rng() - 0.5) * d * 0.5, 0, 1, 1, 1));
      }
    }
    ctx.instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), houses, { cast: shadows, colors: cols });
    ctx.instanced(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 10), new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.6 }), tanks);

    // Mosque landmark
    {
      const p = ctx.at(t.L * 0.3, -(t.wallD + 75));
      const g = new THREE.Group();
      const cream = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.7 });
      const red = new THREE.MeshStandardMaterial({ color: '#a8432c', roughness: 0.85 });
      const gold = new THREE.MeshStandardMaterial({ color: '#d7a83a', metalness: 0.9, roughness: 0.3 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 20), red);
      base.position.y = 4;
      g.add(base);
      const hall = new THREE.Mesh(new THREE.BoxGeometry(22, 6, 14), cream);
      hall.position.y = 11;
      g.add(hall);
      const domes = [[0, 9], [-8, 5.5], [8, 5.5]];
      for (const [x, r] of domes) {
        const dm = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), cream);
        dm.position.set(x, 14, 0);
        dm.scale.y = 1.25;
        g.add(dm);
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.4, 8), gold);
        fin.position.set(x, 14 + r * 1.25 + 1.1, 0);
        g.add(fin);
      }
      for (const [x, z] of [[-15, -10], [15, -10], [-15, 10], [15, 10]]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 30, 12), cream);
        m.position.set(x, 15, z);
        g.add(m);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.6, 12), red);
        ring.position.set(x, 24, z);
        g.add(ring);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 3.5, 12), cream);
        cap.position.set(x, 31.7, z);
        g.add(cap);
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
      g.position.set(p.x, ctx.height(p.x, p.z) - 0.5, p.z);
      g.rotation.y = p.yaw;
      ctx.add(g);
    }

    // Green bilingual motorway signs (left side — Pakistan drives on the left)
    const signs = [
      ['لاہور  LAHORE  85 km', 'اسلام آباد  ISLAMABAD  290 km'],
      ['AURA MOTORWAY  M-X', 'Max Speed 120 km/h'],
      ['فیصل آباد  FAISALABAD  140 km', 'SHEIKHUPURA  32 km'],
      ['SERVICE AREA  2 km', 'Fuel • Food • Prayer'],
      ['کلر کہار  KALLAR KAHAR', 'Salt Range  12 km'],
    ];
    signs.forEach((lines, i) => motorwaySign(ctx, t.L * (0.08 + i * 0.19), -(t.wallD + 2.6), lines));
    billboard(ctx, t.L * 0.17, -(t.wallD + 16), 'CARS x AURA', 'Created by Saif Ur Rehman  •  Pakistan', ['#06070c', '#3ddc84'], 0.5);
    billboard(ctx, t.L * 0.63, -(t.wallD + 16), 'DRIVE THE AURA', 'Punjab Stage  •  Aura Motorway', ['#0b1a12', '#f2c418'], 0.5);
    await nextFrame();

    // Overpass bridge crossing both carriageways
    {
      const s = t.L * 0.52;
      const span = t.wallD * 2 + t.extraRight + 70;
      const c = ctx.at(s, t.extraRight / 2);
      const conc = concreteMaterial('#c8c4bb');
      const g = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 1.3, 13), conc);
      deck.position.y = 8.2;
      g.add(deck);
      const railM = new THREE.MeshStandardMaterial({ color: '#d9d5cc', roughness: 0.8 });
      for (const z of [-6.3, 6.3]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(span, 1.1, 0.35), railM);
        r.position.set(0, 9.4, z);
        g.add(r);
      }
      for (const dx of [-(t.wallD + 3) - t.extraRight / 2, t.wallD + 3 - t.extraRight / 2 + 1.5, t.wallD + t.extraRight / 2 + 3]) {
        for (const z of [-4, 4]) {
          const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 8, 12), conc);
          pl.position.set(dx, 4, z);
          g.add(pl);
        }
      }
      for (const sd of [-1, 1]) {
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(70, 3, 14), new THREE.MeshStandardMaterial({ color: '#8a7f62', roughness: 1 }));
        ramp.position.set(sd * (span / 2 + 32), 4.6, 0);
        ramp.rotation.z = -sd * 0.12;
        g.add(ramp);
      }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = true; } });
      g.position.set(c.x, c.y - 0.3, c.z);
      g.rotation.y = c.yaw + Math.PI; // local +x = road right
      ctx.add(g);
    }

    mountainRing(ctx, { radius: 2050, count: 46, height: [160, 420], color: '#7b8798', snow: '#eef2f6', y: -20 });
  },
};
