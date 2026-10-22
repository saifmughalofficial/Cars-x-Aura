// Track C — Neon City: a night street circuit between glowing towers, through a tunnel and over an
// illuminated harbour bridge. Wet asphalt, neon barriers and street lights.
import * as THREE from 'three';
import { noise2, smoothstep, lerp, nextFrame } from '../game/utils.js';
import { cityBlocks, streetLamps, neonSign, mat4, mountainRing, billboard } from './scenery.js';

const SEA_X = 785;
const _c = new THREE.Color();
const GROUND = new THREE.Color('#1d1d26');
const PLAZA = new THREE.Color('#2a2833');

export default {
  id: 'neon-city',
  name: 'Neon City',
  subtitle: 'Night Street Circuit',
  description: 'Tight city corners, a long tunnel and the harbour bridge — all under neon at midnight. Headlights on.',
  difficulty: 'Hard',
  seed: 53,
  accent: '#ff2bd6',
  points: [
    [0, 0, 0], [0, 300, 0], [30, 400, 0], [120, 440, 0], [380, 440, 0], [460, 410, 0], [500, 330, 0],
    [500, 170, 0], [540, 90, 0], [640, 60, 0], [820, 60, 5], [910, 10, 9], [930, -120, 9], [880, -240, 5],
    [760, -290, 0], [560, -290, 0], [440, -260, 0], [380, -180, 0], [340, -80, 0], [260, -40, 0], [120, -60, 0], [40, -70, 0],
  ],
  road: {
    halfWidth: 7.5, lanes: 3, shoulder: 2.4, shoulderKind: 'sidewalk', shoulderIsRoad: true,
    base: '#26272d', edge: '#e8e8ff', lane: '#c9c9de', wet: true, skirt: '#2a2a32', seed: 13,
  },
  wall: { kind: 'concrete', color: '#5b5d68', neon: ['#ff2bd6', '#22e6ff'] },
  kerbs: false,
  tunnels: [{ from: 0.86, to: 0.95 }],
  tunnelColor: '#2b2d38',
  tunnelLight: '#9fe8ff',
  sprint: { start: 0.05, length: 0.88 },
  gateText: 'NEON CITY',
  gateColor: '#ff2bd6',
  env: {
    night: true,
    skyTop: '#03020a', skyHorizon: '#2b1446', skyBottom: '#120a20',
    sunDir: [-0.35, 0.62, 0.55], sunColor: '#8ea8ff', sunIntensity: 0.55,
    hemiSky: '#5b4ab0', hemiGround: '#140b22', hemiIntensity: 0.75,
    fog: '#1b1030', fogNear: 140, fogFar: 1400, exposure: 1.1,
    bloom: { strength: 0.85, threshold: 0.62, radius: 0.55 },
    stars: true, moon: true, ambience: 'city',
  },
  terrain: {
    margin: 420,
    blend: 30,
    detail: 'grass',
    verge: [0.11, 0.11, 0.14],
    water: { level: -3, color: '#0a1022', roughness: 0.04 },
    bridgeZone: (x) => x > SEA_X - 60,
    height(x, z) {
      return lerp(0, -9, smoothstep(SEA_X - 20, SEA_X + 25, x));
    },
    color(x, z, h, info, out) {
      _c.copy(GROUND).lerp(PLAZA, 0.5 + 0.5 * noise2(x / 30, z / 30, 3));
      if (h < -1) _c.set('#16161c');
      out[0] = _c.r;
      out[1] = _c.g;
      out[2] = _c.b;
    },
  },

  async scenery(ctx) {
    const t = ctx.track;
    cityBlocks(ctx, {
      spacing: 42, minClear: 9, maxH: 170, night: true, center: [420, 120],
      avoid: (x, z, size) => x + size / 2 > SEA_X - 30,
    });
    await nextFrame();
    streetLamps(ctx, { every: 34, color: '#ffd9a8', poolColor: 'rgba(255,190,120,1)', height: 9, offset: 1.2, poolOpacity: 0.32 });

    // Illuminated arches over the harbour bridge
    const arches = [];
    const step = Math.round(26 / t.ds);
    for (let i = 0; i < t.N; i += step) {
      if (!t.bridge[i]) continue;
      arches.push(mat4(t.px[i], t.py[i], t.pz[i], Math.atan2(t.tx[i], t.tz[i]) + Math.PI / 2, 1, 1, 1));
    }
    if (arches.length) {
      const g = new THREE.TorusGeometry(t.wallD + 2, 0.35, 6, 28, Math.PI);
      g.rotateY(Math.PI / 2);
      const m = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#22e6ff', emissiveIntensity: 2.2 });
      ctx.instanced(g, m, arches, { receive: false });
    }

    // Neon signs along the circuit
    const signs = [
      ['AURA', '#ff2bd6', 'NIGHT RACING'], ['CXA MOTORS', '#22e6ff', 'Garage • Tuning'], ['NEON 24/7', '#ffb02e', null],
      ['CHAI & CODE', '#8a5cff', 'Open all night'], ['SAIF UR REHMAN', '#22e6ff', 'Game Developer • Pakistan'],
      ['TURBO', '#ff2bd6', null], ['KARACHI NIGHTS', '#ffb02e', 'City of Lights'], ['HYPER DRIVE', '#7cff6b', null],
    ];
    signs.forEach(([text, col, sub], i) => {
      const s = t.L * (0.03 + i * 0.118);
      const side = i % 2 ? 1 : -1;
      neonSign(ctx, s, side * (t.wallD + 7), text, col, { height: 9 + (i % 3) * 3, sub });
    });
    billboard(ctx, t.L * 0.41, -(t.wallD + 9), 'CARS x AURA', 'Created by Saif Ur Rehman', ['#05050a', '#ff2bd6'], 1.4);

    // Distant skyline silhouette across the water
    mountainRing(ctx, { radius: 1500, count: 70, height: [60, 240], color: '#14121f', y: -12 });
  },
};
