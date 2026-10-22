// Pause menu, results screen, credits and the track-loading overlay.
import { el, esc, LOGO, CREDIT_HTML } from './dom.js';
import { formatTime, ordinal } from '../game/utils.js';

export class Overlays {
  constructor(root, game) {
    this.game = game;
    this.pause = el(`
      <div class="modal pause hidden" role="dialog" aria-label="Paused">
        <div class="modal-box panel narrow">
          <h2>PAUSED</h2>
          <div class="p-info"></div>
          <button class="mbtn primary" data-act="resume"><span>RESUME</span></button>
          <button class="mbtn" data-act="restart"><span>RESTART</span></button>
          <button class="mbtn" data-act="camera"><span>CHANGE CAMERA</span><small class="p-cam"></small></button>
          <button class="mbtn" data-act="settings"><span>SETTINGS</span></button>
          <button class="mbtn" data-act="quit"><span>QUIT TO MENU</span></button>
        </div>
      </div>`);
    this.results = el(`
      <div class="modal results hidden" role="dialog" aria-label="Results">
        <div class="modal-box panel wide">
          <div class="r-head"><small class="r-mode"></small><h2 class="r-title"></h2><div class="r-sub"></div></div>
          <div class="r-badges"></div>
          <table class="r-table"><thead></thead><tbody></tbody></table>
          <div class="r-btns">
            <button class="cta hot" data-act="again">RACE AGAIN</button>
            <button class="cta" data-act="setup">CHANGE TRACK / MODE</button>
            <button class="cta" data-act="garage">GARAGE</button>
            <button class="cta" data-act="menu">MAIN MENU</button>
          </div>
        </div>
      </div>`);
    this.creditsEl = el(`
      <div class="modal credits hidden" role="dialog" aria-label="Credits">
        <div class="modal-box panel">
          <header><span></span><button class="x" data-act="close" aria-label="Close">✕</button></header>
          ${LOGO('mid')}
          <div class="credit-body">
            ${CREDIT_HTML}
            <h3>ABOUT</h3>
            <p>Cars x Aura is an original browser racing game built with Three.js, the Web Audio API and plain JavaScript. Every car, track, texture and sound is generated procedurally in code — no proprietary game assets are used. Inspired by the energy of arcade racers such as Asphalt 8: Airborne, with its own identity, tracks and interface.</p>
            <h3>OPEN-SOURCE</h3>
            <p>Three.js (MIT) · es-module-shims (MIT) · Orbitron &amp; Rajdhani fonts (SIL Open Font License) · Streamlit (Apache-2.0) for hosting.</p>
            <h3>DISCLAIMER</h3>
            <p class="muted">Vehicle names describe the real-world body styles that inspired each original model. Cars x Aura is not affiliated with, endorsed or sponsored by Toyota, BMW, Honda, Nissan, Porsche, Mercedes-Benz, Gameloft or any other company. All trademarks belong to their owners.</p>
          </div>
        </div>
      </div>`);
    this.loading = el(`
      <div class="modal loading-ov hidden" aria-live="polite">
        <div class="lo-box">
          ${LOGO('mid')}
          <div class="lo-track"></div>
          <div class="l-bar"><div class="l-fill"></div></div>
          <div class="lo-msg"></div>
          <div class="lo-tip"></div>
        </div>
      </div>`);
    root.append(this.pause, this.results, this.creditsEl, this.loading);

    this.pause.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        game.audio.click();
        const a = b.dataset.act;
        if (a === 'resume') game.resume();
        else if (a === 'restart') game.restartRace();
        else if (a === 'camera') {
          game.cycleCamera();
          this._pauseInfo();
        } else if (a === 'settings') game.settingsUI.open();
        else if (a === 'quit') game.quitToMenu();
      }),
    );
    this.results.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        game.audio.click();
        const a = b.dataset.act;
        this.results.classList.add('hidden');
        if (a === 'again') game.restartRace();
        else if (a === 'setup') game.quitToMenu('setup');
        else if (a === 'garage') game.quitToMenu('garage');
        else game.quitToMenu();
      }),
    );
    this.creditsEl.querySelector('[data-act=close]').addEventListener('click', () => this.creditsEl.classList.add('hidden'));
    this.creditsEl.addEventListener('click', (e) => {
      if (e.target === this.creditsEl) this.creditsEl.classList.add('hidden');
    });
  }

  _pauseInfo() {
    const g = this.game;
    this.pause.querySelector('.p-cam').textContent = g.cameraName();
    const r = g.race;
    if (r) this.pause.querySelector('.p-info').textContent = `${r.M.label} · ${r.track.name}`;
  }

  showPause(on) {
    if (on) this._pauseInfo();
    this.pause.classList.toggle('hidden', !on);
  }

  credits() {
    this.creditsEl.classList.remove('hidden');
  }

  showLoading(trackName, tip) {
    this.loading.classList.remove('hidden');
    this.loading.querySelector('.lo-track').textContent = trackName;
    this.loading.querySelector('.lo-tip').textContent = tip;
    this.progress(0, 'Preparing…');
  }

  progress(p, msg) {
    this.loading.querySelector('.l-fill').style.width = `${Math.round(p * 100)}%`;
    if (msg) this.loading.querySelector('.lo-msg').textContent = msg;
  }

  hideLoading() {
    this.loading.classList.add('hidden');
  }

  showResults(res, badges) {
    const R = this.results;
    R.querySelector('.r-mode').textContent = `${res.label.toUpperCase()} · ${res.track.toUpperCase()}`;
    let title = '', sub = '';
    if (res.mode === 'drift') {
      title = `${res.driftScore.toLocaleString()} PTS`;
      sub = `Best single chain: ${res.driftBestChain.toLocaleString()} pts`;
    } else if (res.mode === 'timetrial') {
      title = formatTime(res.time);
      sub = `Best lap ${formatTime(res.bestLap)} · ${res.laps} laps`;
    } else if (res.mode === 'free') {
      title = 'FREE DRIVE';
      sub = `${res.km.toFixed(1)} km driven`;
    } else {
      title = res.position === 1 ? 'YOU WIN!' : `${ordinal(res.position).toUpperCase()} PLACE`;
      sub = `Time ${formatTime(res.time)}${res.bestLap ? ' · Best lap ' + formatTime(res.bestLap) : ''}`;
    }
    R.querySelector('.r-title').textContent = title;
    R.querySelector('.r-title').className = 'r-title' + (res.position === 1 && (res.mode === 'circuit' || res.mode === 'sprint') ? ' win' : '');
    R.querySelector('.r-sub').textContent = sub;
    R.querySelector('.r-badges').innerHTML = badges.map((b) => `<span class="badge">${esc(b)}</span>`).join('');
    const thead = R.querySelector('thead'), tbody = R.querySelector('tbody');
    if (res.mode === 'circuit' || res.mode === 'sprint') {
      thead.innerHTML = '<tr><th>POS</th><th>DRIVER</th><th>CAR</th><th>TIME</th><th>BEST LAP</th></tr>';
      tbody.innerHTML = res.rows
        .map((r) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${r.pos}</td><td>${esc(r.name)}</td><td>${esc(r.car)}</td><td>${r.time != null ? formatTime(r.time) + (r.estimated ? ' <small class="est">est.</small>' : '') : '—'}</td><td>${r.bestLap ? formatTime(r.bestLap) : '—'}</td></tr>`)
        .join('');
    } else if (res.lapTimes.length) {
      thead.innerHTML = '<tr><th>LAP</th><th>TIME</th><th></th></tr>';
      tbody.innerHTML = res.lapTimes
        .map((t, i) => `<tr class="${t === res.bestLap ? 'me' : ''}"><td>${i + 1}</td><td>${formatTime(t)}</td><td>${t === res.bestLap ? 'BEST' : ''}</td></tr>`)
        .join('');
    } else {
      thead.innerHTML = '';
      tbody.innerHTML = '';
    }
    R.classList.remove('hidden');
  }

  hideAll() {
    for (const m of [this.pause, this.results, this.loading]) m.classList.add('hidden');
  }
}
