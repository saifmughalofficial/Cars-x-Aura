// Track B — Desert Storm: a technical sunset stage through Cholistan-style dunes, with two jumps,
// an elevated canyon viaduct, an oasis and a sandstone fort.
import * as THREE from 'three';
import { fbm, noise2, smoothstep, lerp, nextFrame } from '../game/utils.js';
import { treeGeometry, vegMaterial, scatter, mat4, rockGeometry, billboard, mountainRing, signBoard } from './scenery.js';
import { textTexture } from '../game/textures.js';

const wadiZ = (x) => 690 + 60 * Math.sin(x / 120);
const OASIS = [520, 170];
const _c = new THREE.Color();
const SAND = new THREE.Color('#d6a364');
const SAND2 = new THREE.Color('#e3b97d');
const ROCK = new THREE.Color('#9a6646');
const GREEN = new THREE.Color('#6f7d3a');

export default {
  id: 'desert-storm',
  name: 'Desert Storm',
  subtitle: 'Thar Rally Stage • Sunset',
  description: 'Twisty desert stage with two big jumps, a canyon viaduct and dust everywhere. Brake late, drift the hairpins.',
  difficulty: 'Medium',
  seed: 37,
  accent: '#ff9a3c',
  points: [
    [0, 0, 1], [0, 260, 3], [-80, 460, 8], [-20, 640, 14], [160, 700, 14], [300, 600, 10], [280, 420, 6],
    [420, 300, 4], [600, 360, 8], [680, 540, 12], [860, 520, 10], [900, 300, 6], [800, 100, 3], [600, -20, 1],
    [380, -40, 2], [200, -140, 4], [40, -150, 1],
  ],
  road: {
    halfWidth: 7.5, lanes: 2, shoulder: 3.5, shoulderKind: 'sand', shoulderIsRoad: false,
    base: '#4a4440', edge: '#f2f2f2', lane: '#f2c418', center: null, skirt: '#b88a5a', seed: 7,
  },
  wall: { kind: 'concrete', color: '#e8dcc8', stripe: '#f2c418' },
  kerbs: true,
  ramps: [
    { at: 0.035, len: 24, height: 3.2 },
    { at: 0.835, len: 26, height: 3.6 },
  ],
  sprint: { start: 0.06, length: 0.88 },
  gateText: 'DESERT STORM',
  gateColor: '#ff9a3c',
  env: {
    night: false,
    skyTop: '#33508f', skyHorizon: '#ffb36b', skyBottom: '#f1b98a',
    sunDir: [-0.75, 0.2, -0.45], sunColor: '#ffb070', sunIntensity: 3.1,
    hemiSky: '#ffd2a3', hemiGround: '#8a5a3a', hemiIntensity: 0.75,
    fog: '#e8ae7c', fogNear: 180, fogFar: 1900, exposure: 1.05,
    bloom: { strength: 0.4, threshold: 0.85, radius: 0.45 },
    sunGlow: 2.2, dust: true, ambience: 'desert',
  },
  terrain: {
    margin: 600,
    blend: 42,
    detail: 'sand',
    verge: [0.78, 0.6, 0.4],
    water: { level: -1.6, color: '#2f6f73', roughness: 0.1 },
    bridgeZone: (x, z) => Math.abs(z - wadiZ(x)) < 70,
    height(x, z) {
      const dunes = Math.pow(1 - Math.abs(noise2(x / 95, z / 150, 7)), 2) * 9;
      let h = 3 + 9 * fbm(x / 340, z / 340, 4, 3) + dunes - 5;
      const dc = Math.hypot(x - 420, z - 280);
      h += smoothstep(1000, 1900, dc) * 60;
      const dw = Math.abs(z - wadiZ(x));
      h = lerp(h, -12, 1 - smoothstep(14, 42, dw));
      const dO = Math.hypot(x - OASIS[0], z - OASIS[1]);
      h = lerp(h, -4, 1 - smoothstep(26, 50, dO));
      return h;
    },
    color(x, z, h, info, out) {
      _c.copy(SAND).lerp(SAND2, 0.5 + 0.5 * noise2(x / 40, z / 40, 2));
      _c.multiplyScalar(0.92 + 0.1 * noise2(x / 6, z / 6, 5));
      if (h < -3) _c.lerp(ROCK, smoothstep(-3, -10, h));
      const dO = Math.hypot(x - OASIS[0], z - OASIS[1]);
      if (dO < 75) _c.lerp(GREEN, 1 - smoothstep(40, 75, dO));
      if (h > 25) _c.lerp(ROCK, smoothstep(25, 60, h) * 0.7);
      out[0] = _c.r;
      out[1] = _c.g;
      out[2] = _c.b;
    },
  },

  async scenery(ctx) {
    const t = ctx.track;
    const shadows = ctx.quality.shadows > 0;
    const rockMat = new THREE.MeshStandardMaterial({ color: '#a26c49', roughness: 0.95, flatShading: true });
    const rocks = scatter(ctx, Math.round(240 * ctx.density), { minClear: 9, maxClear: 520, scale: [1.2, 6], sink: 0.6 });
    ctx.instanced(rockGeometry(3, 1), rockMat, rocks, { cast: shadows });
    // Mesas and rock towers on the horizon
    const mesas = scatter(ctx, 26, { minClear: 140, maxClear: 900, scale: [18, 46], sink: 4 });
    for (const m of mesas) {
      const e = m.elements;
      e[5] *= 1.6;
    }
    ctx.instanced(rockGeometry(9, 1), new THREE.MeshStandardMaterial({ color: '#b0714a', roughness: 1, flatShading: true }), mesas, { cast: false });
    const veg = vegMaterial();
    const shrubs = scatter(ctx, Math.round(340 * ctx.density), { minClear: 7, maxClear: 400, scale: [0.6, 1.4] });
    ctx.instanced(treeGeometry('shrub'), veg, shrubs);
    await nextFrame();

    // Oasis palms
    const palms = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + ctx.rng() * 0.3, r = 48 + ctx.rng() * 20;
      const x = OASIS[0] + Math.cos(a) * r, z = OASIS[1] + Math.sin(a) * r;
      if (ctx.clearance(x, z) < 6) continue;
      const s = 0.8 + ctx.rng() * 0.5;
      palms.push(mat4(x, ctx.height(x, z), z, ctx.rng() * 6, s, s, s, (ctx.rng() - 0.5) * 0.2));
    }
    ctx.instanced(treeGeometry('palm'), veg, palms, { cast: shadows });

    // Tyre stacks on the outside of tight corners
    const tyres = [];
    const step = Math.round(5 / t.ds);
    for (let i = 0; i < t.N; i += step) {
      if (Math.abs(t.curv[i]) < 1 / 75) continue;
      const side = -Math.sign(t.curv[i]);
      const d = side * (t.wallD + 1.1);
      const x = t.px[i] - t.tz[i] * d, z = t.pz[i] + t.tx[i] * d;
      for (let k = 0; k < 3; k++) tyres.push(mat4(x, t.py[i] + 0.15 + k * 0.28, z, 0, 1, 1, 1, Math.PI / 2));
    }
    ctx.instanced(new THREE.TorusGeometry(0.42, 0.16, 6, 12), new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.85 }), tyres);

    // Sandstone fort inspired by the forts of the Cholistan desert
    {
      const p = ctx.at(t.L * 0.55, t.wallD + 150);
      const g = new THREE.Group();
      const stone = new THREE.MeshStandardMaterial({ color: '#c98d5a', roughness: 0.92 });
      const dark = new THREE.MeshStandardMaterial({ color: '#8e5a36', roughness: 0.95 });
      const size = 80, hgt = 18;
      for (let i = 0; i < 4; i++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(size, hgt, 5), stone);
        const a = (i * Math.PI) / 2;
        wall.position.set(Math.sin(a) * size / 2, hgt / 2, Math.cos(a) * size / 2);
        wall.rotation.y = a;
        g.add(wall);
      }
      const bast = new THREE.CylinderGeometry(6, 7.5, hgt + 4, 14);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = (size / 2) / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
        const b = new THREE.Mesh(bast, stone);
        b.position.set(Math.cos(a) * r, (hgt + 4) / 2, Math.sin(a) * r);
        g.add(b);
        for (let k = 0; k < 6; k++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.4), dark);
          const ka = (k / 6) * Math.PI * 2;
          m.position.set(b.position.x + Math.cos(ka) * 6.5, hgt + 4.6, b.position.z + Math.sin(ka) * 6.5);
          g.add(m);
        }
      }
      const gate = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 2), dark);
      gate.position.set(0, 6, -size / 2 - 2);
      g.add(gate);
      g.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
      g.position.set(p.x, ctx.height(p.x, p.z) - 1, p.z);
      g.rotation.y = p.yaw;
      ctx.add(g);
    }

    // Ramp warning boards
    for (const r of t.ramps) {
      const tex = textTexture(512, 256, {
        bg: '#f2c418', border: '#111', borderWidth: 10,
        lines: [{ text: 'JUMP', size: 110, y: 110, color: '#111', font: 'Orbitron, sans-serif' }, { text: 'FULL THROTTLE', size: 40, y: 200, color: '#111' }],
      });
      signBoard(ctx, { s: r.s0 - 70, d: -(t.wallD + 3), w: 5, h: 2.5, tex, height: 2.4 });
    }
    billboard(ctx, t.L * 0.12, t.wallD + 18, 'DESERT STORM', 'A Cars x Aura rally stage', ['#1a0d05', '#ff9a3c'], 0.45);
    billboard(ctx, t.L * 0.46, -(t.wallD + 18), 'SAIF UR REHMAN', 'Game developer • Pakistan', ['#120a05', '#ffcf5a'], 0.45);
    mountainRing(ctx, { radius: 1850, count: 38, height: [90, 220], color: '#a7674a', y: -10 });
  },
};
