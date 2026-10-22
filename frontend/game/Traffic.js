// Highway traffic: decorated Pakistani trucks, vans and small cars cruising in lanes. Traffic on
// the racing carriageway is solid (heavy bodies you can bump); oncoming traffic on the far
// carriageway is visual only. Vehicles recycle around the player so the road always feels busy.
import * as THREE from 'three';
import { truckArtTexture } from './textures.js';
import { clamp, wrapAngle } from './utils.js';

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

let models = null;
function buildModels() {
  if (models) return models;
  const mat = (o) => {
    const m = new THREE.MeshStandardMaterial(o);
    m.userData.shared = true;
    return m;
  };
  const dark = mat({ color: '#18191c', roughness: 0.8 });
  const glass = mat({ color: '#10161d', metalness: 0.5, roughness: 0.1 });
  const tyre = mat({ color: '#141414', roughness: 0.9 });
  const lamp = mat({ color: '#fff', emissive: '#ffe8c0', emissiveIntensity: 1.2 });
  const tail = mat({ color: '#400', emissive: '#ff2020', emissiveIntensity: 1 });
  const wheels = (len, track, r) => {
    const out = [];
    for (const z of [len * 0.32, -len * 0.3]) for (const x of [track, -track]) {
      const g = new THREE.CylinderGeometry(r, r, 0.3, 12);
      g.rotateZ(Math.PI / 2);
      g.translate(x, r, z);
      out.push(g);
    }
    return out;
  };
  const group = (parts) => {
    const g = new THREE.Group();
    for (const [geos, m] of parts) for (const geo of geos) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      g.add(mesh);
    }
    return g;
  };
  const truck = (seed) => {
    const art = mat({ map: truckArtTexture(seed), roughness: 0.6 });
    const cab = mat({ color: ['#e8262b', '#f7c51e', '#1aa34a', '#1f6fd6'][seed % 4], roughness: 0.5, metalness: 0.2 });
    const wood = mat({ color: '#8a5a2b', roughness: 0.8 });
    return {
      L: 9.5, W: 2.5, mass: 9000, speed: [15, 19],
      make: () => group([
        [[box(2.4, 1.9, 2.2, 0, 1.75, 3.4)], cab],
        [[box(2.3, 0.9, 0.08, 0, 2.15, 4.52)], glass],
        [[box(2.5, 1.3, 1.0, 0, 3.25, 3.9)], art], // decorated crown above the cab ("taj")
        [[box(2.5, 2.6, 6.2, 0, 2.3, -1.2)], art],
        [[box(2.5, 0.2, 6.6, 0, 0.95, -1.0)], wood],
        [[box(2.4, 0.5, 9.2, 0, 0.75, 0)], dark],
        [[box(0.25, 0.2, 0.05, 0.9, 1.1, 4.52), box(0.25, 0.2, 0.05, -0.9, 1.1, 4.52)], lamp],
        [[box(0.3, 0.2, 0.05, 0.95, 1.1, -4.3), box(0.3, 0.2, 0.05, -0.95, 1.1, -4.3)], tail],
        [wheels(9.5, 1.05, 0.55), tyre],
      ]),
    };
  };
  const van = () => {
    const body = mat({ color: '#e9ecef', roughness: 0.45, metalness: 0.2 });
    return {
      L: 4.6, W: 1.7, mass: 1600, speed: [20, 25],
      make: () => group([
        [[box(1.65, 1.5, 4.4, 0, 1.15, 0)], body],
        [[box(1.5, 0.6, 0.05, 0, 1.5, 2.21)], glass],
        [[box(0.25, 0.12, 0.05, 0.6, 0.85, 2.21), box(0.25, 0.12, 0.05, -0.6, 0.85, 2.21)], lamp],
        [[box(0.2, 0.25, 0.05, 0.7, 0.9, -2.21), box(0.2, 0.25, 0.05, -0.7, 0.9, -2.21)], tail],
        [wheels(4.4, 0.72, 0.32), tyre],
      ]),
    };
  };
  const hatch = (color) => {
    const body = mat({ color, roughness: 0.35, metalness: 0.4 });
    return {
      L: 3.6, W: 1.5, mass: 900, speed: [21, 27],
      make: () => group([
        [[box(1.5, 0.7, 3.5, 0, 0.6, 0)], body],
        [[box(1.36, 0.55, 2.0, 0, 1.22, -0.25)], glass],
        [[box(1.38, 0.06, 1.8, 0, 1.5, -0.3)], body],
        [[box(0.25, 0.12, 0.05, 0.5, 0.75, 1.76), box(0.25, 0.12, 0.05, -0.5, 0.75, 1.76)], lamp],
        [[box(0.2, 0.15, 0.05, 0.55, 0.8, -1.76), box(0.2, 0.15, 0.05, -0.55, 0.8, -1.76)], tail],
        [wheels(3.5, 0.66, 0.27), tyre],
      ]),
    };
  };
  models = [truck(1), truck(2), truck(3), van(), hatch('#c8ccd2'), hatch('#b3121c'), hatch('#f2f2f2'), van()];
  return models;
}

export class Traffic {
  constructor(scene, track, { count = 10, oncoming = 10 } = {}) {
    this.scene = scene;
    this.track = track;
    this.bodies = [];
    this.visual = [];
    const kinds = buildModels();
    const lanes = 3, lw = (track.hw * 2) / lanes;
    for (let i = 0; i < count; i++) {
      const k = kinds[i % kinds.length];
      const mesh = k.make();
      scene.add(mesh);
      // Slow traffic keeps left (Pakistan drives on the left)
      const lane = k.mass > 5000 ? 0 : 1 + (i % 2);
      const b = {
        kind: k, mesh, lane, d: -track.hw + lw * (lane + 0.5),
        cruise: k.speed[0] + Math.random() * (k.speed[1] - k.speed[0]),
        x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, yawRate: 0, mass: k.mass,
        halfL: k.L / 2, halfW: k.W / 2, q: track.makeQuery(), s: 0, bump: 0, isTraffic: true, drifting: false,
      };
      this._place(b, ((i + 0.5) / count) * track.L);
      this.bodies.push(b);
    }
    if (track.oppositeLanes) {
      for (let i = 0; i < oncoming; i++) {
        const k = kinds[(i * 3) % kinds.length];
        const mesh = k.make();
        scene.add(mesh);
        this.visual.push({ mesh, s: (i / oncoming) * track.L, d: track.oppositeLanes[i % track.oppositeLanes.length], v: k.speed[1] + 3 });
      }
    }
  }

  _place(b, s) {
    const smp = this.track.sampleAt(s);
    b.s = s;
    b.x = smp.x + smp.rx * b.d;
    b.z = smp.z + smp.rz * b.d;
    b.y = smp.y;
    b.h = Math.atan2(smp.tx, smp.tz);
    b.vx = Math.sin(b.h) * b.cruise;
    b.vz = Math.cos(b.h) * b.cruise;
    b.q.idx = smp.idx;
    this.track.query(b.x, b.z, b.q);
  }

  /** Fixed-step update. playerS keeps traffic recycled around the player. */
  step(dt, playerS) {
    const t = this.track;
    for (const b of this.bodies) {
      const q = t.query(b.x, b.z, b.q);
      b.s = q.s;
      // steer back to lane and cruise speed (simple controller on a heavy body)
      const th = Math.atan2(q.tx, q.tz);
      const latErr = b.d - q.d;
      const wantH = th - Math.atan2(latErr, 14);
      b.h += clamp(wrapAngle(wantH - b.h), -0.6 * dt, 0.6 * dt) + b.yawRate * dt;
      b.yawRate *= Math.exp(-3 * dt);
      const fx = Math.sin(b.h), fz = Math.cos(b.h);
      let vL = b.vx * fx + b.vz * fz;
      let vS = -b.vx * fz + b.vz * fx;
      vL += clamp(b.cruise - vL, -4 * dt, 1.5 * dt);
      vS *= Math.exp(-6 * dt);
      b.vx = fx * vL - fz * vS;
      b.vz = fz * vL + fx * vS;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y = q.groundY;
      // recycle: keep traffic within a window around the player
      const rel = t.wrapDelta(b.s - playerS);
      if (rel < -250 || rel > 900) this._place(b, playerS + 450 + Math.random() * 400);
    }
    for (const v of this.visual) v.s = (v.s - v.v * dt + t.L) % t.L;
  }

  /** Render-frame sync. */
  update() {
    for (const b of this.bodies) {
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.rotation.y = b.h;
    }
    for (const v of this.visual) {
      const p = this.track.sampleAt(v.s);
      v.mesh.position.set(p.x + p.rx * v.d, p.y, p.z + p.rz * v.d);
      v.mesh.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI;
    }
  }

  dispose() {
    for (const o of [...this.bodies.map((b) => b.mesh), ...this.visual.map((v) => v.mesh)]) {
      this.scene.remove(o);
      o.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
      });
    }
  }
}
