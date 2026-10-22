// Waypoint-following AI driver: steers towards a look-ahead point on its own racing line, plans
// braking from the upcoming curvature, avoids cars ahead, uses nitro on straights and recovers
// itself when stuck. Uses exactly the same physics as the player.
import { clamp, wrapAngle } from './utils.js';

export const DIFFICULTY = {
  easy: { label: 'Easy', speed: 0.86, corner: 0.84, nitro: 0.3 },
  normal: { label: 'Normal', speed: 0.94, corner: 0.93, nitro: 0.6 },
  hard: { label: 'Hard', speed: 1.0, corner: 1.0, nitro: 0.95 },
};

export class AIController {
  constructor(car, track, difficulty = 'normal', rand = Math.random) {
    this.car = car;
    this.track = track;
    const d = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.skill = {
      speed: d.speed * (0.97 + rand() * 0.05),
      corner: d.corner * (0.96 + rand() * 0.06),
      nitro: d.nitro,
    };
    this.rand = rand;
    this.lane = (rand() - 0.5) * track.hw * 0.9;
    this.offset = this.lane;
    this.laneTimer = 2 + rand() * 4;
    this.stuck = 0;
    this.nitroHold = 0;
    this.rubber = 1;
  }

  update(dt, cars, player) {
    const car = this.car, p = car.phys, t = this.track, inp = car.input;
    const q = p.q;
    const v = Math.max(0, p.vL);
    const N = t.N, ds = t.ds;

    // lane wandering + racing line towards the inside of the next corner
    this.laneTimer -= dt;
    if (this.laneTimer < 0) {
      this.lane = (this.rand() - 0.5) * t.hw * 1.0;
      this.laneTimer = 3 + this.rand() * 5;
    }
    const aheadIdx = (q.idx + Math.round((30 + v * 1.2) / ds)) % N;
    const k = t.curv[aheadIdx];
    let desired = this.lane;
    if (Math.abs(k) > 1 / 300) desired = clamp(Math.sign(k) * t.hw * 0.55, -t.hw + 1.6, t.hw - 1.6);

    // avoid cars ahead in our lane and cars right alongside (don't fight for the same line)
    this.blocked = 0;
    for (const o of cars) {
      if (o === car) continue;
      const op = o.phys;
      const dsAhead = t.wrapDelta(op.q.s - q.s);
      if (dsAhead > -4.5 && dsAhead < 9 + v * 0.35) {
        const lat = op.q.d - q.d;
        if (Math.abs(lat) < 2.7) {
          let side;
          if (dsAhead < 2) side = lat > 0 ? -1 : 1; // alongside: keep to the side we're on
          else {
            const roomL = op.q.d + t.hw, roomR = t.hw - op.q.d;
            side = roomR > roomL ? 1 : -1;
          }
          desired = clamp(op.q.d + side * 3.4, -t.hw + 1.4, t.hw - 1.4);
          if (dsAhead > 0 && dsAhead < 7 && Math.abs(lat) < 1.9) this.blocked = Math.max(this.blocked, op.vL);
          break;
        }
      }
    }
    this.offset += clamp(desired - this.offset, -4 * dt, 4 * dt);

    // steering towards a look-ahead point
    const look = 7 + v * 0.42;
    const ti = (q.idx + Math.round(look / ds)) % N;
    const rx = -t.tz[ti], rz = t.tx[ti];
    const tx = t.px[ti] + rx * this.offset, tz = t.pz[ti] + rz * this.offset;
    const want = Math.atan2(tx - p.x, tz - p.z);
    let err = wrapAngle(want - p.h);
    if (p.vL < -0.5) err = -err;
    inp.steer = clamp(-err * 2.6, -1, 1);

    // speed planning: lowest allowed speed over the braking horizon
    const lat = p.latMax * p.H.lat * this.skill.corner * 0.92;
    const brake = p.brakeDecel * 0.85;
    const horizon = Math.min(260, (v * v) / (2 * brake) + 30);
    let vt = p.vTop * this.skill.speed * this.rubber;
    const stepN = 2;
    for (let j = 0; j * ds < horizon; j += stepN) {
      const i = (q.idx + j) % N;
      const kk = t.absCurv[i];
      if (kk < 1e-4) continue;
      const vmax = Math.sqrt(lat / kk);
      const allowed = Math.sqrt(vmax * vmax + 2 * brake * j * ds);
      if (allowed < vt) vt = allowed;
    }
    // boxed in right behind someone: don't keep ramming them while the gap opens
    if (this.blocked > 0) vt = Math.min(vt, this.blocked + 0.5);
    if (v < vt - 0.8) {
      inp.throttle = 1;
      inp.brake = 0;
    } else if (v < vt + 1.5) {
      inp.throttle = 0.35;
      inp.brake = 0;
    } else {
      inp.throttle = 0;
      inp.brake = clamp((v - vt) / 5, 0.25, 1);
    }
    inp.handbrake = false;

    // nitro on straights
    if (this.nitroHold > 0) this.nitroHold -= dt;
    const straight = vt >= p.vTop * this.skill.speed * 0.98;
    if (straight && v > 18 && p.nitro > 0.5 && this.rand() < this.skill.nitro * dt * 2) this.nitroHold = 1.5 + this.rand();
    inp.nitro = this.nitroHold > 0 && straight;

    // rubber-banding (gentle): keeps races close without teleporting anyone
    if (player && player.race && car.race) {
      const gap = player.race.progress - car.race.progress;
      const target = gap > 120 ? 1.06 : gap > 40 ? 1.02 : gap < -160 ? 0.93 : gap < -60 ? 0.97 : 1;
      this.rubber += (target - this.rubber) * Math.min(1, dt * 0.5);
    }

    // stuck recovery
    if (v < 1.5 && !p.frozen) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 2.5) {
      this.stuck = 0;
      return 'reset';
    }
    return null;
  }
}
