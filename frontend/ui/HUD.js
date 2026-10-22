// In-race heads-up display: speedometer / tachometer / gear, nitro, position, laps, timers,
// mini-map, live standings, countdown, notifications, drift chain and wrong-way warning.
import { formatTime, clamp } from '../game/utils.js';

const html = String.raw;

export class HUD {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    root.innerHTML = html`
      <div class="hud-tl">
        <div class="hud-pos"><span class="pos-n">1</span><span class="pos-of">/6</span><small>POS</small></div>
        <div class="hud-lap"><small>LAP</small><span class="lap-n">1/3</span></div>
        <ol class="hud-board"></ol>
      </div>
      <div class="hud-tc">
        <div class="hud-time">0:00.000</div>
        <div class="hud-sub"></div>
      </div>
      <div class="hud-tr">
        <canvas class="hud-map" width="180" height="180"></canvas>
        <div class="hud-btns">
          <button class="hud-btn" data-act="camera" title="Change camera (C)">🎥</button>
          <button class="hud-btn" data-act="pause" title="Pause (Esc)">❚❚</button>
        </div>
      </div>
      <div class="hud-center">
        <div class="hud-count"></div>
        <div class="hud-wrong">WRONG WAY</div>
        <div class="hud-drift"><b class="d-pts">0</b><span class="d-mult">x1</span><small>DRIFT</small></div>
        <div class="hud-notes"></div>
        <div class="hud-hint"></div>
      </div>
      <div class="hud-bl">
        <div class="nitro"><div class="nitro-fill"></div></div>
        <div class="nitro-label">NITRO <kbd>SHIFT</kbd></div>
        <div class="hud-fps"></div>
      </div>
      <div class="hud-br">
        <canvas class="speedo" width="260" height="260"></canvas>
      </div>`;
    const $ = (s) => root.querySelector(s);
    this.el = {
      pos: $('.pos-n'), posOf: $('.pos-of'), posBox: $('.hud-pos'), lap: $('.lap-n'), lapBox: $('.hud-lap'),
      board: $('.hud-board'), time: $('.hud-time'), sub: $('.hud-sub'), map: $('.hud-map'),
      count: $('.hud-count'), wrong: $('.hud-wrong'), drift: $('.hud-drift'), dPts: $('.d-pts'), dMult: $('.d-mult'),
      notes: $('.hud-notes'), hint: $('.hud-hint'), nitro: $('.nitro-fill'), nitroBox: $('.nitro'), fps: $('.hud-fps'),
      speedo: $('.speedo'),
    };
    this.sctx = this.el.speedo.getContext('2d');
    this.mctx = this.el.map.getContext('2d');
    root.querySelectorAll('.hud-btn').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        game.input.emit(b.dataset.act);
      }),
    );
    this.lastSpeedDraw = -1;
    this.boardT = 0;
  }

  show(race) {
    this.race = race;
    this.root.classList.remove('hidden');
    const ai = race.M.ai;
    this.el.posBox.style.display = ai ? '' : 'none';
    this.el.board.style.display = ai ? '' : 'none';
    this.el.lapBox.style.display = race.M.laps ? '' : 'none';
    this.el.drift.classList.remove('on');
    this.el.notes.innerHTML = '';
    this.el.count.className = 'hud-count';
    this._prepMap(race.track);
    this.lastSpeedDraw = -1;
  }

  hide() {
    this.root.classList.add('hidden');
  }

  _prepMap(track) {
    const W = 180, pad = 12;
    const b = track.bounds;
    const sx = (W - pad * 2) / (b.maxX - b.minX), sz = (W - pad * 2) / (b.maxZ - b.minZ);
    const s = Math.min(sx, sz);
    const ox = (W - (b.maxX - b.minX) * s) / 2, oz = (W - (b.maxZ - b.minZ) * s) / 2;
    // world X grows to the left on screen so the map matches the driver's view from above
    this.mapTf = (x, z) => [W - (ox + (x - b.minX) * s), W - (oz + (z - b.minZ) * s)];
    const c = document.createElement('canvas');
    c.width = c.height = W;
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= track.N; i += 3) {
      const [x, y] = this.mapTf(track.px[i % track.N], track.pz[i % track.N]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 9;
    g.stroke();
    g.strokeStyle = 'rgba(230,236,255,0.85)';
    g.lineWidth = 4;
    g.stroke();
    const [sx0, sy0] = this.mapTf(track.px[0], track.pz[0]);
    g.fillStyle = '#ffffff';
    g.fillRect(sx0 - 4, sy0 - 4, 8, 8);
    this.mapBase = c;
  }

  countdown(n) {
    const c = this.el.count;
    c.textContent = n > 0 ? String(n) : 'GO!';
    c.className = 'hud-count';
    void c.offsetWidth;
    c.className = 'hud-count show' + (n === 0 ? ' go' : '');
  }

  notify(text, kind = 'info', ms = 1800) {
    const d = document.createElement('div');
    d.className = 'hnote ' + kind;
    d.textContent = text;
    this.el.notes.appendChild(d);
    while (this.el.notes.children.length > 3) this.el.notes.firstChild.remove();
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 500);
  }

  hint(text) {
    if (this._hintText === text) return;
    this._hintText = text;
    this.el.hint.textContent = text || '';
    this.el.hint.classList.toggle('on', !!text);
  }

  /** Per-frame update. */
  update(dt, { race, player, units, fps, showFps, cars }) {
    const p = player.phys, r = player.race;
    const e = this.el;
    // position / laps
    if (race.M.ai) {
      e.pos.textContent = r.position;
      e.posOf.textContent = '/' + cars.length;
    }
    if (race.M.laps) e.lap.textContent = `${race.currentLap}/${race.laps}`;
    // timer
    let main = '', sub = '';
    if (race.mode === 'drift') {
      main = formatTime(race.remainingDrift).slice(0, -2);
      sub = `SCORE ${Math.round(race.drift.score).toLocaleString()}`;
    } else if (race.mode === 'free') {
      main = 'FREE DRIVE';
      sub = `${(p.odometer / 1000).toFixed(1)} km driven`;
    } else {
      main = formatTime(race.state === 'race' || race.state === 'finished' ? race.time : 0);
      if (race.M.laps) sub = `LAP ${formatTime(race.state === 'race' ? race.lapTime : 0)}${r.bestLap ? '  ·  BEST ' + formatTime(r.bestLap) : ''}`;
      else sub = `${Math.ceil(race.toGo)} m TO FINISH`;
    }
    if (e.time.textContent !== main) e.time.textContent = main;
    if (e.sub.textContent !== sub) e.sub.textContent = sub;
    // standings (4 Hz)
    this.boardT -= dt;
    if (race.M.ai && race.standing && this.boardT <= 0) {
      this.boardT = 0.25;
      let h = '';
      for (const c of race.standing) {
        const me = c === player;
        h += `<li class="${me ? 'me' : ''}"><b>${c.race.position}</b>${me ? 'YOU' : c.driver || c.name}</li>`;
      }
      if (h !== this._board) {
        this._board = h;
        e.board.innerHTML = h;
      }
    }
    // nitro
    e.nitro.style.transform = `scaleX(${p.nitro.toFixed(3)})`;
    e.nitroBox.classList.toggle('full', p.nitro > 0.98);
    e.nitroBox.classList.toggle('active', p.nitroActive);
    // drift chain
    const D = race.drift;
    const on = D.chain > 1;
    e.drift.classList.toggle('on', on);
    if (on) {
      e.dPts.textContent = Math.round(D.chain).toLocaleString();
      e.dMult.textContent = 'x' + D.mult;
    }
    e.wrong.classList.toggle('on', !!race.wrongWay);
    e.fps.textContent = showFps ? `${Math.round(fps)} FPS` : '';
    this._speedo(p, units);
    this._map(cars, player);
  }

  _speedo(p, units) {
    const v = units === 'mph' ? p.kmh * 0.6214 : p.kmh;
    const key = Math.round(v) * 100 + Math.round((p.rpm / p.redline) * 60) + (p.gear + 2) * 1e6 + (p.nitroActive ? 5e8 : 0);
    if (key === this.lastSpeedDraw) return;
    this.lastSpeedDraw = key;
    const c = this.sctx, W = 260, cx = 130, cy = 140, R = 104;
    c.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    // background ring
    c.lineCap = 'round';
    c.lineWidth = 12;
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath();
    c.arc(cx, cy, R, a0, a1);
    c.stroke();
    // redline zone
    const red = 0.86;
    c.strokeStyle = 'rgba(255,60,90,0.35)';
    c.beginPath();
    c.arc(cx, cy, R, a0 + (a1 - a0) * red, a1);
    c.stroke();
    // rpm arc
    const f = clamp((p.rpm - p.idle * 0.6) / (p.redline - p.idle * 0.6), 0, 1);
    const g = c.createLinearGradient(30, 0, 230, 0);
    g.addColorStop(0, '#22e6ff');
    g.addColorStop(0.7, '#a855ff');
    g.addColorStop(1, '#ff2b6a');
    c.strokeStyle = p.nitroActive ? '#7fdcff' : g;
    c.shadowColor = p.nitroActive ? '#22e6ff' : '#a855ff';
    c.shadowBlur = 14;
    c.beginPath();
    c.arc(cx, cy, R, a0, a0 + (a1 - a0) * f);
    c.stroke();
    c.shadowBlur = 0;
    // ticks
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16));
      c.lineTo(cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24));
      c.stroke();
    }
    // speed
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.font = '800 66px Orbitron, "Segoe UI", sans-serif';
    c.fillText(String(Math.round(v)), cx, cy + 16);
    c.font = '700 16px Rajdhani, "Segoe UI", sans-serif';
    c.fillStyle = 'rgba(220,226,245,0.7)';
    c.fillText(units === 'mph' ? 'MPH' : 'KM/H', cx, cy + 40);
    // gear
    const gear = p.gear < 0 ? 'R' : p.speed < 0.5 && p.throttle < 0.05 ? 'N' : String(p.gear + 1);
    c.font = '800 30px Orbitron, "Segoe UI", sans-serif';
    c.fillStyle = f > red ? '#ff4d6d' : '#22e6ff';
    c.fillText(gear, cx, cy + 86);
  }

  _map(cars, player) {
    const c = this.mctx;
    c.clearRect(0, 0, 180, 180);
    if (this.mapBase) c.drawImage(this.mapBase, 0, 0);
    for (const car of cars) {
      if (car === player || !car.phys) continue;
      const [x, y] = this.mapTf(car.phys.x, car.phys.z);
      c.fillStyle = '#ff9a3c';
      c.beginPath();
      c.arc(x, y, 4, 0, Math.PI * 2);
      c.fill();
    }
    const p = player.phys;
    const [x, y] = this.mapTf(p.x, p.z);
    c.save();
    c.translate(x, y);
    // map is mirrored on both axes, heading arrow follows
    c.rotate(-p.h + Math.PI);
    c.fillStyle = '#22e6ff';
    c.shadowColor = '#22e6ff';
    c.shadowBlur = 8;
    c.beginPath();
    c.moveTo(0, 8);
    c.lineTo(5.5, -5);
    c.lineTo(-5.5, -5);
    c.closePath();
    c.fill();
    c.restore();
  }
}
