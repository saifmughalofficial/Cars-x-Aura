// Runtime vehicle: procedural model + physics + visual animation (wheels, steering, suspension,
// body roll, brake / reverse / head lights, nitro flames and night light beams).
import * as THREE from 'three';
import { buildVehicleModel, updatePaint } from './VehicleFactory.js';
import { VehiclePhysics } from '../game/VehiclePhysics.js';
import { clamp, damp } from '../game/utils.js';
import { gradientTexture } from '../game/textures.js';

let flameMat = null;
let coneMat = null;

function getFlameMat() {
  if (!flameMat) {
    flameMat = new THREE.MeshBasicMaterial({
      // v = 1 (canvas top) is the cone apex = flame tip
      map: gradientTexture([[0, 'rgba(255,90,20,1)'], [0.6, 'rgba(110,190,255,1)'], [1, 'rgba(255,255,255,1)']], true, 'flame2'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
    });
    flameMat.userData.shared = true;
  }
  return flameMat;
}

function getConeMat() {
  if (!coneMat) {
    coneMat = new THREE.MeshBasicMaterial({
      // cone apex (at the lamp) is uv.y = 1 = canvas top: bright there, fading out to the far end
      map: gradientTexture([[0, '#bdb39a'], [0.45, '#1c1a14'], [1, '#000000']], true, 'beam2'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.32,
    });
    coneMat.userData.shared = true;
  }
  return coneMat;
}

const flameGeo = (() => {
  const g = new THREE.ConeGeometry(0.075, 0.7, 10, 1, true);
  g.rotateX(-Math.PI / 2); // apex towards -z (backwards)
  g.translate(0, 0, -0.35);
  g.userData.shared = true;
  return g;
})();

const beamGeo = (() => {
  const g = new THREE.ConeGeometry(2.6, 16, 18, 1, true);
  g.rotateX(-Math.PI / 2); // apex at -z, opening +z
  g.translate(0, 0, 8);
  g.rotateX(0.07);
  g.userData.shared = true;
  return g;
})();

export class Vehicle {
  constructor(cfg, { paint = null, quality, ghost = false, isPlayer = false, night = false, name = null } = {}) {
    this.cfg = cfg;
    this.isPlayer = isPlayer;
    this.name = name || cfg.name;
    this.paint = paint || { ...cfg.paint };
    this.quality = quality;
    this.model = buildVehicleModel(cfg, {
      paint: this.paint,
      physical: quality.physical,
      lowDetail: !isPlayer && quality.key === 'low',
      shadowMaps: quality.shadows > 0,
      ghost,
    });
    this.root = this.model.root;
    this.ghost = ghost;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.phys = null;
    this.susp = 0;
    this.suspV = 0;
    this.pitch = 0;
    this.roll = 0;
    this.slopePitch = 0;
    this.slopeRoll = 0;
    this.spinF = 0;
    this.spinR = 0;
    this.flames = [];
    this.beams = [];
    this.flameLevel = 0;
    this.backfire = 0;
    this.race = null;
    if (!ghost) this._createFlames();
    this.setNight(night);
  }

  attach(track, handling = 'arcade') {
    this.track = track;
    this.phys = new VehiclePhysics(this.cfg, track, handling);
    this._gq = [track.makeQuery(), track.makeQuery(), track.makeQuery(), track.makeQuery()];
    this.phys.onShift = (dir) => {
      if (dir > 0 && Math.random() < 0.55) this.backfire = 0.12;
    };
    return this.phys;
  }

  setPaint(color, finish) {
    updatePaint(this.model.mats.paint, color, finish);
    this.paint = { color, finish };
  }

  _createFlames() {
    for (const a of this.model.anchors.exhaust) {
      const f = new THREE.Mesh(flameGeo, getFlameMat());
      f.position.copy(a);
      f.visible = false;
      f.renderOrder = 3;
      this.model.bodyInner.add(f);
      this.flames.push(f);
    }
  }

  setNight(on) {
    this.night = on;
    const m = this.model.mats;
    if (this.ghost) return;
    m.head.emissiveIntensity = on ? 3.2 : 0.5;
    m.drl.emissiveIntensity = on ? 2.6 : 1.6;
    if (on && !this.beams.length) {
      for (const a of this.model.anchors.head) {
        const b = new THREE.Mesh(beamGeo, getConeMat());
        b.position.copy(a);
        b.renderOrder = 2;
        this.model.bodyInner.add(b);
        this.beams.push(b);
      }
    }
    for (const b of this.beams) b.visible = on;
  }

  _ground(x, z, q) {
    q.idx = this.phys.q.idx;
    return this.track.query(x, z, q).groundY;
  }

  /** Sync the visual model with physics. dt = render frame time. */
  update(dt) {
    const p = this.phys, m = this.model, r = this.root;
    if (!p) return;
    r.position.set(p.x, p.y, p.z);
    const sh = Math.sin(p.h), ch = Math.cos(p.h);
    let tp, tr;
    if (p.grounded) {
      const hw = m.dims.wb / 2, tw = 0.8;
      const yf = this._ground(p.x + sh * hw, p.z + ch * hw, this._gq[0]);
      const yr = this._ground(p.x - sh * hw, p.z - ch * hw, this._gq[1]);
      const yl = this._ground(p.x + ch * tw, p.z - sh * tw, this._gq[2]);
      const yrr = this._ground(p.x - ch * tw, p.z + sh * tw, this._gq[3]);
      tp = -Math.atan2(yf - yr, m.dims.wb);
      tr = Math.atan2(yl - yrr, tw * 2);
    } else {
      tp = clamp(-p.vy * 0.018, -0.25, 0.3);
      tr = this.slopeRoll * 0.98;
    }
    this.slopePitch = damp(this.slopePitch, tp, p.grounded ? 14 : 2.5, dt);
    this.slopeRoll = damp(this.slopeRoll, tr, 10, dt);
    r.rotation.set(this.slopePitch, p.h, this.slopeRoll, 'YXZ');

    // suspension spring + body roll / pitch
    if (p.landImpact > 0) this.suspV -= Math.min(2.2, p.landImpact * 0.12);
    let bump = 0;
    if (p.grounded && p.surface !== 'road' && p.speed > 3) bump = (Math.random() - 0.5) * 0.9 * Math.min(1, p.speed / 25);
    const k = 170, c = 13;
    const sdt = Math.min(dt, 1 / 30);
    this.suspV += (-this.susp * k - this.suspV * c + bump * 8) * sdt;
    this.susp = clamp(this.susp + this.suspV * sdt, -0.12, 0.1);
    const soft = this.cfg.type === 'suv' || this.cfg.type === 'pickup' ? 1.6 : this.cfg.type === 'hyper' || this.cfg.type === 'sports' ? 0.7 : 1;
    const rollT = clamp(p.latAccel * 0.0042 * soft, -0.075, 0.075);
    const pitchT = clamp(-p.accelL * 0.0032 * soft, -0.05, 0.05) + (p.nitroActive ? -0.012 : 0);
    this.roll = damp(this.roll, p.grounded ? rollT : 0, 7, dt);
    this.pitch = damp(this.pitch, p.grounded ? pitchT : 0, 7, dt);
    m.bodyPivot.position.y = m.dims.rollCenter + this.susp;
    m.bodyPivot.rotation.set(this.pitch, 0, this.roll);

    // wheels
    const R = m.dims.r;
    const locked = this.input.handbrake && p.grounded;
    const wheelspin = p.throttle > 0.5 && p.speed < 7 && !p.frozen ? 18 * (1 - p.speed / 7) : 0;
    this.spinF += (p.vL / R) * dt;
    this.spinR += locked ? 0 : (p.vL / R + (p.frozen ? 0 : wheelspin)) * dt;
    for (const w of m.wheels) {
      w.spin.rotation.x = w.front ? this.spinF : this.spinR;
      if (w.front) w.pivot.rotation.y = -p.steer * 1.05;
    }
    m.steerSpin.rotation.z = (p.steer / 0.6) * 2.3;

    // lights
    const mats = m.mats;
    if (!this.ghost) {
      mats.tail.emissiveIntensity = p.braking || (locked && p.speed > 1) ? 3.4 : this.night ? 1.3 : 0.7;
      mats.rev.emissiveIntensity = p.reversing ? 2.5 : 0.08;
      // nitro flames + gear-change backfire
      this.backfire = Math.max(0, this.backfire - dt);
      const target = p.nitroActive ? 1 : this.backfire > 0 ? 0.55 : 0;
      this.flameLevel = damp(this.flameLevel, target, 18, dt);
      for (const f of this.flames) {
        const on = this.flameLevel > 0.04;
        f.visible = on;
        if (on) {
          const fl = this.flameLevel * (0.75 + Math.random() * 0.5);
          f.scale.set(0.8 + fl * 0.6, 0.8 + fl * 0.6, fl * (p.nitroActive ? 1.6 : 0.8));
        }
      }
    }
  }

  /** Cockpit view: render the shell double-sided so roof, pillars and glass are visible from inside. */
  setInteriorView(on) {
    if (this._interior === on || this.ghost) return;
    this._interior = on;
    const shell = this.model.bodyInner.children[0];
    for (const mesh of shell.children) {
      if (!mesh.userData.orig) mesh.userData.orig = mesh.material;
      if (on) {
        if (!mesh.userData.ds) {
          mesh.userData.ds = mesh.material.clone();
          mesh.userData.ds.side = THREE.DoubleSide;
          if (mesh.name === 'glass') mesh.userData.ds.opacity = 0.28; // see out of the windows
        }
        mesh.material = mesh.userData.ds;
      } else mesh.material = mesh.userData.orig;
    }
  }

  /** World position of rear tyre contact patches (for smoke and skid marks). */
  rearContacts(out) {
    const p = this.phys;
    const sh = Math.sin(p.h), ch = Math.cos(p.h);
    let i = 0;
    for (const a of this.model.anchors.rearWheels) {
      const o = out[i] || (out[i] = new THREE.Vector3());
      o.set(p.x + ch * a.x + sh * a.z, p.y, p.z - sh * a.x + ch * a.z);
      i++;
    }
    return out;
  }

  /** Local anchor -> world (ignores body roll; good enough for effects). */
  toWorld(local, out) {
    const p = this.phys;
    const sh = Math.sin(p.h), ch = Math.cos(p.h);
    return out.set(p.x + ch * local.x + sh * local.z, p.y + local.y, p.z - sh * local.x + ch * local.z);
  }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    for (const mesh of this.model.bodyInner.children[0].children) {
      if (mesh.userData.ds) mesh.userData.ds.dispose();
    }
    this.model.dispose();
  }
}
