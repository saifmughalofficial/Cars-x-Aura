// Camera rig: chase, close chase, front, hood, cockpit and cinematic trackside views, plus the
// race-intro fly-around and the results orbit. Speed-sensitive FOV, smoothed motion and shake.
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from './utils.js';

export const CAMERA_MODES = ['Chase', 'Close Chase', 'Front View', 'Hood', 'Cockpit', 'Cinematic'];

const _target = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export class CameraManager {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.car = null;
    this.track = null;
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.baseFov = 62;
    this.fov = 62;
    this.heading = 0;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.orbitTimer = 0;
    this.state = 'drive'; // drive | intro | orbit
    this.introT = 0;
    this.cine = { s: 0, side: 1, h: 4 };
    this.q = null;
    this.transition = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
  }

  attach(car, track) {
    this.car = car;
    this.track = track;
    this.q = track.makeQuery();
    this.heading = car.phys.h;
    this.snap();
  }

  setMode(i) {
    this.mode = ((i % CAMERA_MODES.length) + CAMERA_MODES.length) % CAMERA_MODES.length;
    this.transition = 1;
    if (this.mode === 5) this._pickCine(true);
    const interior = this.mode === 4;
    if (this.car) {
      // keep light beams out of internal views; show the cabin from inside in cockpit view
      for (const b of this.car.beams) b.visible = this.car.night && !interior && this.mode !== 3;
      this.car.setInteriorView(interior);
    }
  }

  next() {
    this.setMode(this.mode + 1);
    return CAMERA_MODES[this.mode];
  }

  shake(amount) {
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount);
  }

  intro(duration = 3) {
    this.state = 'intro';
    this.introT = 0;
    this.introDur = duration;
  }

  orbit() {
    this.state = 'orbit';
    this.introT = 0;
  }

  drive() {
    this.state = 'drive';
    this.snap();
  }

  /** Mouse/touch drag offsets for the chase camera. */
  drag(dx, dy) {
    this.orbitYaw = clamp(this.orbitYaw - dx * 0.006, -Math.PI, Math.PI);
    this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, -0.2, 0.6);
    this.orbitTimer = 1.6;
  }

  snap() {
    if (!this.car) return;
    this.heading = this.car.phys.h;
    this._desired(0, true);
    this.pos.copy(_pos);
    this.look.copy(_look);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  _pickCine(first) {
    const p = this.car.phys;
    const s = (p.q.s + (first ? 40 : 70)) % this.track.L;
    this.cine.s = s;
    this.cine.side = Math.random() < 0.5 ? -1 : 1;
    this.cine.h = 1.5 + Math.random() * 5;
    const smp = this.track.sampleAt(s);
    const d = this.cine.side * (this.track.wallD + 4 + Math.random() * 6);
    this.cine.x = smp.x + smp.rx * d;
    this.cine.z = smp.z + smp.rz * d;
    this.cine.y = smp.y + this.cine.h;
  }

  /** Computes desired camera position (_pos) and look target (_look). */
  _desired(dt, instant = false) {
    const c = this.car, p = c.phys, a = c.model.anchors, dims = c.model.dims;
    const sh = Math.sin(p.h), ch = Math.cos(p.h);
    const L = dims.L;
    // Heading used by chase cams follows the car, lagging slightly, and blends to velocity in drifts.
    let targetH = p.h;
    if (p.speed > 4 && p.vL > 0) {
      const velH = Math.atan2(p.vx, p.vz);
      targetH = p.h + wrapAngle(velH - p.h) * 0.45;
    }
    if (p.vL < -2) targetH = p.h;
    this.heading = instant ? targetH : this.heading + wrapAngle(targetH - this.heading) * (1 - Math.exp(-6 * dt));
    const hs = Math.sin(this.heading + this.orbitYaw), hc = Math.cos(this.heading + this.orbitYaw);
    const speedK = clamp(p.speed / 70, 0, 1);
    switch (this.mode) {
      case 0:
      case 1: {
        const close = this.mode === 1;
        const dist = (close ? 4.6 : 6.4) + L * (close ? 0.25 : 0.42) + speedK * (close ? 0.6 : 1.2);
        const height = (close ? 1.45 : 2.0) + dims.H * 0.55 + this.orbitPitch * dist;
        _pos.set(p.x - hs * dist, p.y + height, p.z - hc * dist);
        _look.set(p.x + sh * 3, p.y + dims.H * 0.62 + 0.4, p.z + ch * 3);
        break;
      }
      case 2: {
        const dist = 4.5 + L * 0.5;
        _pos.set(p.x + sh * dist, p.y + 1.3 + dims.H * 0.3, p.z + ch * dist);
        _look.set(p.x, p.y + dims.H * 0.5, p.z);
        break;
      }
      case 3:
      case 4: {
        const an = this.mode === 3 ? a.hood : a.cockpit;
        c.root.updateMatrixWorld();
        c.model.bodyInner.localToWorld(_pos.copy(an));
        _look.copy(an);
        _look.z += 20;
        _look.y -= this.mode === 3 ? 0.9 : 1.1;
        c.model.bodyInner.localToWorld(_look);
        break;
      }
      case 5: {
        if (!this.cine.x) this._pickCine(true);
        const dz = this.track.wrapDelta(p.q.s - this.cine.s);
        if (dz > 45) this._pickCine(false);
        _pos.set(this.cine.x, this.cine.y, this.cine.z);
        _look.set(p.x, p.y + 0.8, p.z);
        break;
      }
    }
  }

  update(dt) {
    if (!this.car) return;
    const p = this.car.phys;
    const cam = this.camera;
    if (this.orbitTimer > 0) {
      this.orbitTimer -= dt;
      if (this.orbitTimer <= 0) this.orbitTimer = 0;
    } else {
      this.orbitYaw = damp(this.orbitYaw, 0, 3, dt);
      this.orbitPitch = damp(this.orbitPitch, 0, 3, dt);
    }

    if (this.state === 'intro' || this.state === 'orbit') {
      this.introT += dt;
      const isIntro = this.state === 'intro';
      const t = isIntro ? clamp(this.introT / this.introDur, 0, 1) : 0;
      const ang = isIntro ? p.h + Math.PI * 0.85 - t * Math.PI * 1.05 : p.h + this.introT * 0.25;
      const dist = isIntro ? lerp(9, 7.2, t) : 9;
      const hgt = isIntro ? lerp(1.2, 2.6, t) : 2.4;
      _pos.set(p.x + Math.sin(ang) * dist, p.y + hgt, p.z + Math.cos(ang) * dist);
      _look.set(p.x, p.y + 0.8, p.z);
      this.pos.lerp(_pos, 1 - Math.exp(-6 * dt));
      this.look.lerp(_look, 1 - Math.exp(-8 * dt));
      if (this.introT < 0.05) {
        this.pos.copy(_pos);
        this.look.copy(_look);
      }
      this.fov = damp(this.fov, 50, 4, dt);
    } else {
      this._desired(dt);
      const internal = this.mode === 3 || this.mode === 4;
      if (internal) {
        this.pos.copy(_pos);
        this.look.copy(_look);
      } else if (this.mode === 5) {
        this.pos.copy(_pos);
        this.look.lerp(_look, 1 - Math.exp(-12 * dt));
      } else {
        const k = this.transition > 0 ? 5 : 14;
        this.pos.lerp(_pos, 1 - Math.exp(-k * dt));
        this.look.lerp(_look, 1 - Math.exp(-18 * dt));
      }
      this.transition = Math.max(0, this.transition - dt * 2);
      let fovT = this.baseFov + clamp(p.speed / 80, 0, 1) * 16 + (p.nitroActive ? 9 : 0);
      if (internal) fovT += 6;
      if (this.mode === 5) fovT = clamp(55 - Math.hypot(this.pos.x - p.x, this.pos.z - p.z) * 0.25, 22, 55);
      this.fov = damp(this.fov, fovT, 4, dt);
    }

    // keep the camera above ground, inside the walls and under tunnel roofs
    if (this.q && this.mode !== 3 && this.mode !== 4) {
      this.q.idx = p.q.idx;
      const q = this.track.query(this.pos.x, this.pos.z, this.q);
      const lim = this.track.wallD + (q.d > 0 ? this.track.extraRight : 0) + 3;
      if (Math.abs(q.d) > lim && this.state === 'drive' && this.mode !== 5) {
        const over = Math.abs(q.d) - lim;
        this.pos.x -= q.rx * Math.sign(q.d) * over;
        this.pos.z -= q.rz * Math.sign(q.d) * over;
      }
      const minY = q.groundY + 0.6;
      if (this.pos.y < minY) this.pos.y = minY;
      if (this.track.inTunnel(q.s)) this.pos.y = Math.min(this.pos.y, q.y + 6.2);
    }

    cam.position.copy(this.pos);
    // shake
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt * 40;
      const s = this.shakeAmt * 0.12;
      cam.position.x += Math.sin(this.shakeT * 1.3) * s;
      cam.position.y += Math.sin(this.shakeT * 1.7 + 1) * s;
      cam.position.z += Math.sin(this.shakeT * 1.1 + 2) * s;
      this.shakeAmt *= Math.exp(-5 * dt);
    }
    // subtle high-speed vibration
    if (p.speed > 45 && this.state === 'drive') {
      const v = (p.speed - 45) * 0.0007 * (p.nitroActive ? 2 : 1);
      cam.position.y += (Math.random() - 0.5) * v;
    }
    cam.lookAt(this.look);
    if (this.mode === 4 || this.mode === 3) {
      // lean with the car body
      _tmp.set(0, 1, 0).applyQuaternion(this.car.model.bodyInner.getWorldQuaternion(_quat));
      cam.up.lerp(_tmp, 0.5);
    } else cam.up.set(0, 1, 0);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
