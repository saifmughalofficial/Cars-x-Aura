// Arcade vehicle dynamics: a bicycle model with speed-sensitive steering, tyre grip that bleeds
// lateral velocity, controlled handbrake drifts, automatic gearbox, nitro and ballistic jumps.
// Units: metres, seconds, radians. Heading h: forward = (sin h, cos h) in world XZ.
import { clamp, lerp } from './utils.js';

export const HANDLING = {
  arcade: {
    label: 'Arcade', grip: 15, driftGrip: 2.7, lat: 1.2, steerRate: 5.5, returnRate: 8, driftYaw: 1.7,
    brake: 1.15, entry: 0.15, slide: false, counter: 1,
  },
  sport: {
    label: 'Sport', grip: 12, driftGrip: 2.2, lat: 1.08, steerRate: 4.6, returnRate: 6.5, driftYaw: 1.6,
    brake: 1.05, entry: 0.2, slide: false, counter: 0.6,
  },
  pro: {
    label: 'Professional', grip: 10, driftGrip: 1.7, lat: 0.98, steerRate: 3.8, returnRate: 5, driftYaw: 1.5,
    brake: 1, entry: 0.25, slide: true, counter: 0.2,
  },
};

export const GRAVITY = 18; // arcade gravity: snappier jumps than 9.81

export class VehiclePhysics {
  constructor(cfg, track, handling = 'arcade') {
    this.cfg = cfg;
    this.track = track;
    const p = cfg.perf;
    this.vTop = p.top / 3.6;
    const v100 = 27.78;
    // Engine curve a(v) = a0 * (1 - (v/vTop)^2): pick a0 so 0-100 km/h matches the spec.
    this.a0 = (v100 / p.accel) / (1 - (v100 / this.vTop) ** 2 / 3);
    this.latMax = p.lat;
    this.brakeDecel = p.brake;
    this.mass = p.mass;
    this.wheelbase = cfg.dims.wb;
    this.halfW = cfg.dims.W / 2;
    this.halfL = cfg.dims.L / 2;
    this.gears = p.gears;
    this.gearTops = [];
    for (let g = 0; g < p.gears; g++) this.gearTops.push(this.vTop * 1.03 * Math.pow((g + 1) / p.gears, 0.72));
    this.redline = cfg.engine === 'diesel' ? 4500 : cfg.engine === 'hyper' ? 9200 : cfg.engine === 'v8' ? 7200 : 7000;
    this.idle = cfg.engine === 'diesel' ? 750 : 900;
    this.steerSens = 1;
    this.setHandling(handling);
    this.q = track ? track.makeQuery() : null;
    this.reset();
  }

  setHandling(key) {
    this.handlingKey = HANDLING[key] ? key : 'arcade';
    this.H = HANDLING[this.handlingKey];
  }

  reset() {
    this.x = 0; this.y = 0; this.z = 0; this.h = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.vL = 0; this.vS = 0;
    this.speed = 0;
    this.grounded = true;
    this.airTime = 0;
    this.prevGround = 0;
    this.landImpact = 0;
    this.gear = 0;
    this.rpm = this.idle;
    this.shiftT = 0;
    this.nitro = 0.45;
    this.nitroActive = false;
    this.drifting = false;
    this.driftExit = 0;
    this.driftAngle = 0;
    this.slip = 0;
    this.accelL = 0;
    this.latAccel = 0;
    this.throttle = 0;
    this.braking = false;
    this.reversing = false;
    this.frozen = false;
    this.wallHit = 0;
    this.surface = 'road';
    this.odometer = 0;
  }

  /** Put the car on the racing line at distance s (m) with lateral offset d (m, +right). */
  placeAt(s, d = 0) {
    const t = this.track;
    const smp = t.sampleAt(s);
    this.reset();
    this.x = smp.x + smp.rx * d;
    this.z = smp.z + smp.rz * d;
    this.h = Math.atan2(smp.tx, smp.tz);
    this.q.idx = smp.idx;
    t.query(this.x, this.z, this.q);
    this.y = this.q.groundY;
    this.prevGround = this.y;
  }

  /** Advance one fixed step. inp = { throttle, brake, steer, handbrake, nitro } */
  step(dt, inp) {
    const H = this.H;
    let throttle = clamp(inp.throttle, 0, 1);
    const brake = clamp(inp.brake, 0, 1);
    const steerIn = clamp(inp.steer, -1, 1);
    const hb = !!inp.handbrake;
    this.throttle = throttle;

    const sh = Math.sin(this.h), ch = Math.cos(this.h);
    const fx = sh, fz = ch, rx = -ch, rz = sh;
    let vL = this.vx * fx + this.vz * fz;
    let vS = this.vx * rx + this.vz * rz;

    if (this.frozen) {
      // Countdown: wheels held, engine can be revved.
      this.vx = this.vz = 0;
      this.vL = this.vS = this.speed = 0;
      const target = this.idle + throttle * (this.redline - this.idle) * 0.92;
      this.rpm = lerp(this.rpm, target, 1 - Math.exp(-(throttle > 0 ? 7 : 4) * dt));
      this.gear = 0;
      this.slip = 0;
      return;
    }

    const speed = Math.abs(vL);
    const offroad = this.surface !== 'road';
    const offMul = offroad ? clamp(0.62 + (this.cfg.offroad - 1) * 0.8 + 0.2, 0.55, 1) : 1;

    // ── steering (speed-sensitive, rate-limited)
    const steerMax = 0.6 / (1 + speed / 21) * this.steerSens;
    let target = steerIn * steerMax;
    // Arcade counter-steer assist while drifting
    if (this.drifting && H.counter > 0 && Math.abs(steerIn) < 0.1) target = clamp(this.driftAngle, -0.3, 0.3) * 0.3 * H.counter;
    const rate = (Math.abs(steerIn) > 0.01 ? H.steerRate : H.returnRate) * 0.6;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);

    // ── longitudinal
    let aL = 0;
    this.nitroActive = !!inp.nitro && this.nitro > 0.01 && throttle > 0.1 && vL > 2;
    const vTopEff = this.vTop * (this.nitroActive ? 1.16 : 1) * (offroad ? 0.55 + 0.3 * Math.min(1.4, this.cfg.offroad) : 1);
    this.braking = false;
    this.reversing = false;
    if (this.grounded) {
      if (throttle > 0) {
        if (vL > -0.5) {
          const r = Math.max(0, vL) / vTopEff;
          let a = r < 1 ? this.a0 * (1 - r * r) : -(r - 1) * 25;
          if (this.nitroActive) a += this.a0 * 0.55 + 3;
          if (this.shiftT > 0) a *= 0.45;
          aL += a * throttle;
        } else {
          aL += this.brakeDecel * throttle;
          this.braking = true;
        }
      }
      if (brake > 0) {
        if (vL > 0.8) {
          aL -= this.brakeDecel * H.brake * brake;
          this.braking = true;
        } else if (throttle < 0.1) {
          const vRev = 11;
          aL -= 6.5 * brake * Math.max(0, 1 - -vL / vRev);
          this.reversing = vL < -0.3;
        }
      }
      if (Math.abs(vL) > 0.05) {
        const coast = throttle < 0.05 && brake < 0.05 ? 1.2 : 0.2;
        const drag = (1.6 / (this.vTop * this.vTop)) * vL * vL;
        aL -= Math.sign(vL) * (coast + drag + (offroad ? 1.5 : 0));
      }
      if (hb) aL -= Math.sign(vL) * 3.2;
    }
    const prev = vL;
    vL += aL * dt;
    // Never let resistance alone push the car through zero into reverse.
    if (prev > 0 && vL < 0 && !(brake > 0 && prev < 0.8 && throttle < 0.1)) vL = 0;
    if (prev < 0 && vL > 0 && throttle < 0.05) vL = 0;

    // ── yaw + lateral grip
    const driftAngle = Math.atan2(vS, Math.max(Math.abs(vL), 0.5));
    if (this.grounded) {
      let yawT = (-vL * Math.tan(this.steer)) / this.wheelbase;
      let cap = (this.latMax * H.lat * offMul) / Math.max(Math.abs(vL), 4);
      if (!this.drifting && speed > 11) {
        const want = hb && Math.abs(steerIn) > H.entry;
        const overload = H.slide && Math.abs(yawT) > cap * 1.35 && speed > 22;
        if (want || overload) {
          this.drifting = true;
          this.driftExit = 0;
        }
      }
      if (this.drifting) {
        cap *= H.driftYaw;
        yawT *= 1.3;
        // Keep the slide controllable: never let the angle run away into a spin.
        if (Math.abs(driftAngle) > 0.85) yawT -= Math.sign(driftAngle) * 0.6;
        const settle = !hb && Math.abs(driftAngle) < 0.09;
        if (settle || speed < 7) {
          this.driftExit += dt;
          if (this.driftExit > 0.22) this.drifting = false;
        } else this.driftExit = 0;
      }
      yawT = clamp(yawT, -cap, cap);
      this.yawRate = lerp(this.yawRate, yawT, 1 - Math.exp(-(this.drifting ? 5 : 11) * dt));

      let grip = (this.drifting ? H.driftGrip : H.grip) * offMul;
      if (hb) grip = Math.min(grip, H.driftGrip * 0.65);
      if (Math.abs(driftAngle) > 1.05) grip = Math.max(grip, 6); // anti-spin
      const vS0 = vS;
      vS *= Math.exp(-grip * dt);
      // Keep most of the scrubbed lateral energy as forward speed (arcade drift momentum).
      if (vL > 0) {
        const keep = this.drifting ? 0.8 : 0.5;
        vL = Math.sqrt(vL * vL + keep * (vS0 * vS0 - vS * vS));
      }
    } else {
      this.yawRate *= Math.exp(-1.2 * dt);
      this.yawRate += -steerIn * 0.5 * dt;
    }
    this.h += this.yawRate * dt;
    this.driftAngle = driftAngle;

    // Recompose with the heading of this step (velocity lags heading -> natural slip angle)
    this.vx = fx * vL + rx * vS;
    this.vz = fz * vL + rz * vS;
    this.vL = vL;
    this.vS = vS;
    this.speed = Math.hypot(this.vx, this.vz);
    this.accelL = aL;
    this.latAccel = vL * this.yawRate;

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.odometer += this.speed * dt;

    // ── vertical: ground follow + ballistic flight
    const q = this.track.query(this.x, this.z, this.q);
    const gy = q.groundY;
    this.surface = q.surface;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    this.landImpact = 0;
    if (this.y <= gy) {
      if (!this.grounded && this.airTime > 0.08) this.landImpact = Math.max(0, -this.vy);
      this.y = gy;
      this.vy = clamp((gy - this.prevGround) / dt, -25, 14);
      this.grounded = true;
      this.airTime = 0;
    } else if (this.y > gy + 0.25) {
      this.grounded = false;
      this.airTime += dt;
    }
    this.prevGround = gy;

    // ── nitro
    if (this.nitroActive) this.nitro = Math.max(0, this.nitro - 0.3 * dt);
    else {
      let gain = 0.008;
      if (this.drifting && speed > 12) gain += 0.13 * clamp(Math.abs(driftAngle) / 0.45, 0, 1.4);
      if (!this.grounded) gain += 0.22;
      this.nitro = Math.min(1, this.nitro + gain * dt);
    }

    // ── gearbox + rpm
    if (this.shiftT > 0) this.shiftT -= dt;
    const v = Math.abs(vL);
    if (vL < -0.5) this.gear = -1;
    else {
      if (this.gear < 0) this.gear = 0;
      const top = this.gearTops[this.gear];
      if (v > top * 0.97 && this.gear < this.gears - 1) {
        this.gear++;
        this.shiftT = 0.16;
        this.onShift && this.onShift(1);
      } else if (this.gear > 0 && v < this.gearTops[this.gear - 1] * 0.66) {
        this.gear--;
        this.onShift && this.onShift(-1);
      }
    }
    const gTop = this.gearTops[Math.max(0, this.gear)];
    let frac = clamp(v / gTop, 0, 1.05);
    if (this.gear === -1) frac = clamp(v / 11, 0, 1);
    let targetRpm = this.idle + (this.redline - this.idle) * frac;
    const wheelspin = throttle > 0.5 && v < 7 && this.a0 > 5.5 ? (1 - v / 7) * 0.45 : 0;
    if (!this.grounded) targetRpm = lerp(targetRpm, this.idle + throttle * (this.redline - this.idle), 0.5);
    targetRpm += wheelspin * (this.redline - this.idle);
    if (this.shiftT > 0) targetRpm *= 0.86;
    this.rpm = lerp(this.rpm, clamp(targetRpm, this.idle, this.redline * 1.02), 1 - Math.exp(-14 * dt));

    // ── tyre slip (smoke, squeal, skid marks)
    let slip = clamp((Math.abs(vS) - 1.2) / 5, 0, 1);
    if (hb && speed > 4) slip = Math.max(slip, 0.7);
    if (this.braking && speed > 18 && brake > 0.8) slip = Math.max(slip, 0.25);
    slip = Math.max(slip, wheelspin * 1.6);
    this.slip = this.grounded ? clamp(slip, 0, 1) : 0;
  }

  /** km/h shown on the speedometer */
  get kmh() {
    return Math.abs(this.vL) * 3.6;
  }
}
