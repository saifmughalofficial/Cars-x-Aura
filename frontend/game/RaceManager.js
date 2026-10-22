// Race rules: grid, intro + countdown, progress along the track (unwrapped distance), laps,
// checkpoints, positions, finish, drift scoring, wrong-way detection, time-trial ghost recording.
import { clamp } from './utils.js';

export const MODES = {
  circuit: { id: 'circuit', label: 'Circuit Race', short: 'Circuit', desc: 'Lapped race against AI rivals. Finish first.', ai: true, laps: true },
  sprint: { id: 'sprint', label: 'Sprint', short: 'Sprint', desc: 'Point-to-point dash from the sprint start to the finish arch.', ai: true, laps: false },
  timetrial: { id: 'timetrial', label: 'Time Trial', short: 'Time Trial', desc: 'Just you, the clock and your ghost. Set the fastest lap.', ai: false, laps: true },
  drift: { id: 'drift', label: 'Drift Challenge', short: 'Drift', desc: '90 seconds. Chain long, fast, controlled drifts for points.', ai: false, laps: false },
  free: { id: 'free', label: 'Free Drive', short: 'Free', desc: 'No rules, no timer. Explore, practise and enjoy the view.', ai: false, laps: false },
};

const CHECKPOINTS = 6;
const DRIFT_TIME = 90;
const GHOST_DT = 0.05;

export class RaceManager {
  constructor({ mode, laps, track, cars, player, hooks, ghostData = null }) {
    this.mode = MODES[mode] ? mode : 'circuit';
    this.M = MODES[this.mode];
    this.laps = this.M.laps ? clamp(laps | 0, 1, 9) : 1;
    this.track = track;
    this.cars = cars;
    this.player = player;
    this.hooks = hooks;
    this.state = 'intro';
    this.time = 0;
    this.stateT = 0;
    this.countdown = 3;
    this.introDur = 2.6;
    this.finishOrder = [];
    this.wrongWayT = 0;
    this.drift = { score: 0, chain: 0, chainT: 0, mult: 1, idle: 0, best: 0 };
    this.ghost = ghostData;
    this.ghostRec = [];
    this.ghostT = 0;
    this.recT = 0;
    this.L = track.L;
    if (this.mode === 'sprint') {
      this.startS = track.sprint.start;
      this.distance = track.sprint.length;
    } else {
      this.startS = 0;
      this.distance = this.M.laps ? this.laps * this.L : Infinity;
    }
    this.cpLen = this.mode === 'sprint' ? this.distance / CHECKPOINTS : this.L / CHECKPOINTS;
    this.bestSplits = ghostData && ghostData.splits ? ghostData.splits : null;
  }

  /** Put every car on the grid. */
  setupGrid() {
    const t = this.track;
    const others = this.cars.filter((c) => c !== this.player);
    const order = [...others, this.player]; // player starts at the back, Asphalt-style
    order.forEach((car, k) => {
      let s, d;
      if (this.M.ai) {
        const row = Math.floor(k / 2), col = k % 2;
        s = this.startS - 9 - row * 10 - col * 4;
        d = (col ? 1 : -1) * t.hw * 0.42;
      } else {
        s = this.startS - (this.mode === 'free' ? 6 : 10);
        d = 0;
      }
      car.phys.placeAt(s, d);
      car.phys.frozen = this.mode !== 'free';
      const q = car.phys.q;
      car.race = {
        lastS: q.s, unwrapped: t.wrapDelta(q.s - this.startS), progress: 0,
        laps: 0, lapStart: 0, lapTimes: [], bestLap: null, finished: false, finishTime: null,
        cp: 0, position: k + 1, splits: [], gridIndex: k,
      };
      car.race.progress = car.race.unwrapped;
    });
    if (this.mode === 'free') {
      this.state = 'free';
    }
  }

  get racing() {
    return this.state === 'race' || this.state === 'free';
  }

  /** Fixed-step logic. */
  step(dt) {
    this.stateT += dt;
    if (this.state === 'intro') {
      if (this.stateT >= this.introDur) this._setState('countdown');
      return;
    }
    if (this.state === 'countdown') {
      const n = 3 - Math.floor(this.stateT);
      if (n !== this.countdown && n > 0) {
        this.countdown = n;
        this.hooks.countdown(n);
      }
      if (this.stateT >= 3) {
        this.countdown = 0;
        this.hooks.countdown(0);
        this._go();
      }
      return;
    }
    if (this.state === 'race' || this.state === 'finished' || this.state === 'free') {
      this.time += dt;
      for (const car of this.cars) this._progress(car);
      this._positions();
      this._playerRules(dt);
    }
  }

  _setState(s) {
    this.state = s;
    this.stateT = 0;
    if (s === 'countdown') this.hooks.countdown(3);
  }

  _go() {
    this.state = 'race';
    this.stateT = 0;
    this.time = 0;
    for (const car of this.cars) {
      const p = car.phys;
      p.frozen = false;
      car.race.lapStart = 0;
      if (car === this.player) {
        const frac = (p.rpm - p.idle) / (p.redline - p.idle);
        if (frac > 0.5 && frac < 0.86) {
          p.vx += Math.sin(p.h) * 5;
          p.vz += Math.cos(p.h) * 5;
          p.nitro = Math.min(1, p.nitro + 0.25);
          this.hooks.notify('PERFECT START', 'good');
        }
      } else if (Math.random() < 0.5) {
        p.vx += Math.sin(p.h) * 2;
        p.vz += Math.cos(p.h) * 2;
      }
    }
    this.hooks.go();
  }

  _progress(car) {
    const r = car.race, q = car.phys.q, t = this.track;
    const d = t.wrapDelta(q.s - r.lastS);
    r.unwrapped += d;
    r.lastS = q.s;
    r.progress = r.unwrapped;
    if (r.finished) return;
    if (this.mode === 'circuit' || this.mode === 'timetrial') {
      const done = Math.floor(r.progress / this.L);
      if (done > r.laps && r.progress > 0) {
        const lapTime = this.time - r.lapStart;
        r.lapTimes.push(lapTime);
        if (r.bestLap == null || lapTime < r.bestLap) r.bestLap = lapTime;
        r.lapStart = this.time;
        r.laps = done;
        if (car === this.player) this._playerLap(lapTime, done);
        if (r.laps >= this.laps) this._finish(car);
      }
    } else if (this.mode === 'sprint') {
      if (r.progress >= this.distance) this._finish(car);
    }
    if (car === this.player && this.mode !== 'free' && this.mode !== 'drift') {
      const cp = Math.floor(Math.max(0, r.progress) / this.cpLen);
      if (cp > r.cp) {
        r.cp = cp;
        const within = this.M.laps ? cp % CHECKPOINTS : cp;
        if (within !== 0 && (this.M.laps || cp < CHECKPOINTS)) {
          const split = this.time - r.lapStart;
          r.splits[within] = split;
          let txt = `CHECKPOINT ${within}/${CHECKPOINTS}`;
          let kind = 'info';
          if (this.bestSplits && this.bestSplits[within] != null && this.M.laps) {
            const diff = split - this.bestSplits[within];
            txt += `  ${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)}`;
            kind = diff <= 0 ? 'good' : 'bad';
          }
          this.hooks.checkpoint(txt, kind);
        }
      }
    }
  }

  _playerLap(lapTime, done) {
    const r = this.player.race;
    if (this.mode === 'timetrial') {
      const rec = this.ghostRec;
      if (!this.ghost || lapTime < this.ghost.time) {
        this.ghost = { time: lapTime, car: this.player.cfg.id, paint: this.player.paint, frames: rec.slice(), splits: r.splits.slice() };
        this.bestSplits = this.ghost.splits;
        this.hooks.newGhost(this.ghost);
      }
      this.ghostRec = [];
      this.recT = 0;
      this.ghostT = 0;
    }
    r.splits = [];
    this.hooks.lap(lapTime, done, this.laps);
  }

  _finish(car) {
    const r = car.race;
    r.finished = true;
    r.finishTime = this.time;
    this.finishOrder.push(car);
    if (car === this.player) {
      this.state = 'finished';
      this.stateT = 0;
      this.hooks.playerFinished();
    }
  }

  _positions() {
    const list = this.cars.slice().sort((a, b) => {
      const fa = a.race.finished, fb = b.race.finished;
      if (fa && fb) return a.race.finishTime - b.race.finishTime;
      if (fa) return -1;
      if (fb) return 1;
      return b.race.progress - a.race.progress;
    });
    list.forEach((c, i) => (c.race.position = i + 1));
    this.standing = list;
  }

  _playerRules(dt) {
    const pl = this.player, p = pl.phys, q = p.q;
    // wrong way
    const dot = Math.sin(p.h) * q.tx + Math.cos(p.h) * q.tz;
    if (dot < -0.35 && p.speed > 3 && this.mode !== 'free') this.wrongWayT += dt;
    else this.wrongWayT = Math.max(0, this.wrongWayT - dt * 2);
    this.wrongWay = this.wrongWayT > 1;

    // drift scoring (all modes show chains, Drift Challenge banks them)
    const D = this.drift;
    const ang = Math.abs(p.driftAngle);
    if (this.state !== 'finished' && p.drifting && p.grounded && p.speed > 11 && ang > 0.16 && ang < 1.25 && dot > 0) {
      D.chainT += dt;
      D.idle = 0;
      D.mult = Math.min(5, 1 + Math.floor(D.chainT / 2));
      D.chain += dt * 110 * Math.min(2.2, ang / 0.45) * (p.speed / 22);
    } else if (D.chain > 0) {
      D.idle += dt;
      if (D.idle > 0.7) {
        const pts = Math.round(D.chain * D.mult);
        D.score += pts;
        D.best = Math.max(D.best, pts);
        if (pts >= 50) this.hooks.driftBank(pts);
        D.chain = 0;
        D.chainT = 0;
        D.mult = 1;
      }
    }
    // time trial ghost recording
    if (this.mode === 'timetrial' && this.state === 'race') {
      this.recT += dt;
      while (this.recT >= GHOST_DT) {
        this.recT -= GHOST_DT;
        this.ghostRec.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.h.toFixed(3)]);
      }
      this.ghostT += dt;
    }
    if (this.mode === 'drift' && this.state === 'race' && this.time >= DRIFT_TIME) {
      if (D.chain > 0) {
        D.score += Math.round(D.chain * D.mult);
        D.chain = 0;
      }
      this._finish(pl);
    }
  }

  /** Called by the game when the player hits a wall hard: drift chains are lost. */
  crash(impact) {
    const D = this.drift;
    if (D.chain > 0 && impact > 3.5) {
      D.chain = 0;
      D.chainT = 0;
      D.mult = 1;
      this.hooks.notify('DRIFT CHAIN LOST', 'bad');
    }
  }

  /** Interpolated ghost pose for the current lap time, or null. */
  ghostPose(out) {
    const g = this.ghost;
    if (!g || !g.frames || g.frames.length < 2 || this.mode !== 'timetrial' || this.state !== 'race') return null;
    const f = this.ghostT / GHOST_DT;
    const i = Math.floor(f);
    if (i >= g.frames.length - 1) return null;
    const a = g.frames[i], b = g.frames[i + 1], t = f - i;
    out.x = a[0] + (b[0] - a[0]) * t;
    out.y = a[1] + (b[1] - a[1]) * t;
    out.z = a[2] + (b[2] - a[2]) * t;
    let dh = b[3] - a[3];
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    out.h = a[3] + dh * t;
    return out;
  }

  get currentLap() {
    const r = this.player.race;
    return clamp(r.laps + 1, 1, this.laps);
  }

  get lapTime() {
    return this.state === 'race' ? this.time - this.player.race.lapStart : this.player.race.lapTimes.at(-1) || 0;
  }

  get remainingDrift() {
    return Math.max(0, DRIFT_TIME - this.time);
  }

  /** Distance left to the finish (sprint) in metres. */
  get toGo() {
    return Math.max(0, this.distance - this.player.race.progress);
  }

  results() {
    this._positions();
    const avg = (car) => Math.max(15, car.race.progress / Math.max(1, this.time));
    const rows = this.standing.map((car) => {
      const r = car.race;
      let time = r.finished ? r.finishTime : null;
      if (!r.finished && this.M.ai && isFinite(this.distance)) time = this.time + (this.distance - r.progress) / avg(car);
      return {
        pos: r.position, name: car === this.player ? 'YOU' : car.driver || car.name, car: car.cfg.name,
        time, estimated: !r.finished, bestLap: r.bestLap, isPlayer: car === this.player,
      };
    });
    if (this.M.ai) rows.sort((a, b) => a.time - b.time).forEach((r, i) => (r.pos = i + 1));
    const me = rows.find((r) => r.isPlayer);
    return {
      mode: this.mode, label: this.M.label, track: this.track.name, laps: this.laps, rows,
      position: me ? me.pos : 1, total: rows.length, time: this.player.race.finishTime ?? this.time,
      bestLap: this.player.race.bestLap, lapTimes: this.player.race.lapTimes.slice(),
      driftScore: Math.round(this.drift.score), driftBestChain: Math.round(this.drift.best),
      km: this.player.phys.odometer / 1000,
    };
  }
}
