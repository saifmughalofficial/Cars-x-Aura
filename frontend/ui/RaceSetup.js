// Race setup: choose mode, track, laps, opponents, AI difficulty, traffic and handling, then start.
import { el, esc, segmented, stepper } from './dom.js';
import { TRACKS, previewPath } from '../tracks/TrackManager.js';
import { MODES } from '../game/RaceManager.js';
import { DIFFICULTY } from '../game/AIController.js';
import { HANDLING } from '../game/VehiclePhysics.js';
import { getVehicle } from '../vehicles/VehicleConfig.js';
import { formatTime } from '../game/utils.js';

export const DEFAULT_SETUP = { mode: 'circuit', track: 'pakistan-highway', laps: 3, opponents: 5, difficulty: 'normal', traffic: false };

export class RaceSetup {
  constructor(root, game) {
    this.game = game;
    this.setup = { ...DEFAULT_SETUP, ...(game.save.data.lastSetup || {}) };
    this.el = el(`
      <section class="screen setup" data-screen="setup">
        <header class="scr-head">
          <button class="back" data-act="back">‹ BACK</button>
          <h1>RACE SETUP</h1>
          <span></span>
        </header>
        <div class="setup-grid">
          <div class="panel s-modes"><h3>GAME MODE</h3><div class="mode-list"></div></div>
          <div class="panel s-tracks"><h3>TRACK</h3><div class="track-list"></div></div>
          <div class="panel s-opts">
            <h3>OPTIONS</h3>
            <div class="opt o-laps"><span>Laps</span></div>
            <div class="opt o-opp"><span>Opponents</span></div>
            <div class="opt o-diff"><span>AI skill</span></div>
            <div class="opt o-traffic"><span>Highway traffic</span></div>
            <div class="opt o-hand"><span>Handling</span></div>
            <div class="s-car">
              <div><small>YOUR CAR</small><b class="sc-name"></b><span class="sc-cat"></span></div>
              <button class="ghost-btn" data-act="garage">CHANGE CAR</button>
            </div>
            <button class="cta hot big" data-act="start">START RACE ›</button>
          </div>
        </div>
      </section>`);
    root.appendChild(this.el);
    const $ = (s) => this.el.querySelector(s);
    $('[data-act=back]').addEventListener('click', () => {
      game.audio.click();
      game.showScreen('menu');
    });
    $('[data-act=garage]').addEventListener('click', () => {
      game.audio.click();
      game.showScreen('garage', { returnTo: 'setup' });
    });
    $('[data-act=start]').addEventListener('click', () => {
      game.audio.click();
      this.start();
    });

    // modes
    const ml = $('.mode-list');
    for (const m of Object.values(MODES)) {
      const b = el(`<button class="mode-card" data-v="${m.id}"><b>${esc(m.label)}</b><small>${esc(m.desc)}</small></button>`);
      b.addEventListener('click', () => {
        game.audio.click();
        this.setup.mode = m.id;
        this._sync();
      });
      ml.appendChild(b);
    }
    // tracks
    const tl = $('.track-list');
    for (const t of TRACKS) {
      const b = el(`<button class="track-card" data-v="${t.id}" style="--accent:${t.accent}">
          <canvas width="120" height="90"></canvas>
          <div><b>${esc(t.name)}</b><small>${esc(t.subtitle)}</small><p>${esc(t.description)}</p><span class="t-meta"></span></div>
        </button>`);
      this._drawPreview(b.querySelector('canvas'), t);
      b.addEventListener('click', () => {
        game.audio.click();
        this.setup.track = t.id;
        this._sync();
      });
      tl.appendChild(b);
    }
    // options
    this.laps = stepper(1, 9, this.setup.laps, (v) => (this.setup.laps = v));
    $('.o-laps').appendChild(this.laps);
    this.opp = stepper(0, 7, this.setup.opponents, (v) => (this.setup.opponents = v));
    $('.o-opp').appendChild(this.opp);
    this.diff = segmented(Object.entries(DIFFICULTY).map(([k, d]) => ({ value: k, label: d.label })), this.setup.difficulty, (v) => (this.setup.difficulty = v));
    $('.o-diff').appendChild(this.diff);
    this.traffic = segmented([{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }], this.setup.traffic ? 'on' : 'off', (v) => (this.setup.traffic = v === 'on'));
    $('.o-traffic').appendChild(this.traffic);
    this.hand = segmented(Object.entries(HANDLING).map(([k, h]) => ({ value: k, label: h.label })), game.save.settings.handling, (v) => game.save.setSetting('handling', v));
    $('.o-hand').appendChild(this.hand);
  }

  _drawPreview(canvas, t) {
    const pts = previewPath(t);
    const c = canvas.getContext('2d');
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const s = Math.min(100 / (maxX - minX), 70 / (maxZ - minZ));
    const ox = (120 - (maxX - minX) * s) / 2, oz = (90 - (maxZ - minZ) * s) / 2;
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, 0, 120, 90);
    c.beginPath();
    pts.forEach(([x, z], i) => {
      const px = 120 - (ox + (x - minX) * s), py = 90 - (oz + (z - minZ) * s);
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    });
    c.closePath();
    c.lineWidth = 4;
    c.strokeStyle = t.accent;
    c.shadowColor = t.accent;
    c.shadowBlur = 8;
    c.stroke();
  }

  show(opts = {}) {
    this.setup = { ...DEFAULT_SETUP, ...(this.game.save.data.lastSetup || this.setup) };
    this._sync();
    if (opts.focus === 'tracks') this.el.querySelector('.s-tracks').scrollIntoView({ block: 'nearest' });
    if (opts.focus) this.el.querySelector(opts.focus === 'tracks' ? '.s-tracks' : '.s-modes').classList.add('flash');
    setTimeout(() => this.el.querySelectorAll('.flash').forEach((x) => x.classList.remove('flash')), 900);
  }

  _sync() {
    const s = this.setup, g = this.game;
    this.el.querySelectorAll('.mode-card').forEach((b) => b.classList.toggle('on', b.dataset.v === s.mode));
    this.el.querySelectorAll('.track-card').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === s.track);
      const t = TRACKS.find((x) => x.id === b.dataset.v);
      const best = g.save.data.bestLaps[t.id];
      const drift = g.save.data.driftBest[t.id];
      b.querySelector('.t-meta').textContent = `${t.difficulty}${best ? ' · Best lap ' + formatTime(best.time) : ''}${drift ? ' · Drift ' + drift.toLocaleString() : ''}`;
    });
    const M = MODES[s.mode];
    const show = (sel, on) => (this.el.querySelector(sel).style.display = on ? '' : 'none');
    show('.o-laps', M.laps);
    show('.o-opp', M.ai);
    show('.o-diff', M.ai);
    const track = TRACKS.find((t) => t.id === s.track);
    show('.o-traffic', !!(track && track.traffic) && (s.mode === 'free' || M.ai));
    this.laps.set(s.laps);
    this.opp.set(s.opponents);
    this.diff.set(s.difficulty);
    this.traffic.set(s.traffic ? 'on' : 'off');
    this.hand.set(g.save.settings.handling);
    const car = getVehicle(g.save.data.selectedCar);
    this.el.querySelector('.sc-name').textContent = car.name;
    this.el.querySelector('.sc-cat').textContent = `${car.category} · inspired by ${car.inspiredBy}`;
  }

  start() {
    this.game.save.data.lastSetup = { ...this.setup };
    this.game.save.save();
    this.game.startRace({ ...this.setup });
  }
}
