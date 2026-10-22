// Collision response: track walls (lateral limits in track space) and car-vs-car contacts
// (each car is approximated by two circles along its length, resolved with impulses).
import { clamp, wrapAngle } from './utils.js';

export class CollisionManager {
  constructor(track) {
    this.track = track;
    this.events = [];
  }

  /** Keep a body (VehiclePhysics or traffic) inside the walls. Returns impact speed (m/s) or 0. */
  wall(p, out = null) {
    const q = p.q, t = this.track;
    const th = Math.atan2(q.tx, q.tz);
    const rel = p.h - th;
    const ext = Math.abs(Math.cos(rel)) * p.halfW + Math.abs(Math.sin(rel)) * p.halfL * 0.92;
    const lim = t.wallD - ext;
    let side = 0, pen = 0;
    if (q.d > lim) {
      side = 1;
      pen = q.d - lim;
    } else if (q.d < -lim) {
      side = -1;
      pen = -lim - q.d;
    }
    if (!side) return 0;
    const nx = q.rx * side, nz = q.rz * side;
    p.x -= nx * pen;
    p.z -= nz * pen;
    q.d -= side * pen;
    const vn = p.vx * nx + p.vz * nz;
    if (vn > 0) {
      p.vx -= nx * vn * 1.25;
      p.vz -= nz * vn * 1.25;
      const scrub = 1 - clamp(vn * 0.018, 0.005, 0.35);
      p.vx *= scrub;
      p.vz *= scrub;
      // Arcade wall guidance: rotate the car to run along the barrier instead of sticking.
      const dir = Math.cos(rel) >= 0 ? th : th + Math.PI;
      p.h += wrapAngle(dir - p.h) * clamp(vn * 0.045, 0.04, 0.4);
      p.yawRate *= 0.4;
      if (p.drifting && vn > 6) p.drifting = false;
    }
    if (out) {
      out.x = p.x + nx * ext;
      out.z = p.z + nz * ext;
      out.y = p.y;
    }
    return Math.max(0, vn);
  }

  /** Resolve contacts between all bodies. Calls onHit(a, b, impact, x, z) for noticeable hits. */
  bodies(list, onHit) {
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const A = list[i];
      for (let j = i + 1; j < n; j++) {
        const B = list[j];
        if (Math.abs(A.y - B.y) > 1.6) continue;
        const dx0 = B.x - A.x, dz0 = B.z - A.z;
        const reach = A.halfL + B.halfL + 0.3;
        if (dx0 * dx0 + dz0 * dz0 > reach * reach) continue;
        this._pair(A, B, onHit);
      }
    }
  }

  _pair(A, B, onHit) {
    const imA = A.kinematic ? 0 : 1 / A.mass, imB = B.kinematic ? 0 : 1 / B.mass;
    const im = imA + imB;
    if (im === 0) return;
    const ra = A.halfW * 1.02, rb = B.halfW * 1.02;
    const oa = A.halfL - A.halfW, ob = B.halfL - B.halfW;
    const sa = Math.sin(A.h), ca = Math.cos(A.h), sb = Math.sin(B.h), cb = Math.cos(B.h);
    let worst = 0, hx = 0, hz = 0;
    for (let a = -1; a <= 1; a += 2) {
      for (let b = -1; b <= 1; b += 2) {
        const ax = A.x + sa * oa * a, az = A.z + ca * oa * a;
        const bx = B.x + sb * ob * b, bz = B.z + cb * ob * b;
        let dx = bx - ax, dz = bz - az;
        const d2 = dx * dx + dz * dz, minD = ra + rb;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, nz = dz / d;
        const pen = minD - d;
        A.x -= nx * pen * (imA / im);
        A.z -= nz * pen * (imA / im);
        B.x += nx * pen * (imB / im);
        B.z += nz * pen * (imB / im);
        const rel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
        if (rel < 0) {
          const jImp = (-(1 + 0.25) * rel) / im;
          A.vx -= nx * jImp * imA;
          A.vz -= nz * jImp * imA;
          B.vx += nx * jImp * imB;
          B.vz += nz * jImp * imB;
          // small spin from off-centre hits
          const lever = a * 0.6;
          if (!A.kinematic) A.yawRate += clamp(lever * -rel * 0.02, -0.6, 0.6) * (imA * A.mass);
          if (!B.kinematic) B.yawRate -= clamp(b * 0.6 * -rel * 0.02, -0.6, 0.6) * (imB * B.mass);
          if (-rel > worst) {
            worst = -rel;
            hx = (ax + bx) / 2;
            hz = (az + bz) / 2;
          }
        }
      }
    }
    if (worst > 1.5 && onHit) onHit(A, B, worst, hx, hz);
  }
}
