// Main menu: logo, navigation, developer credit and a summary of local records, over the 3D showroom.
import { el, esc, LOGO, PK } from './dom.js';
import { getVehicle } from '../vehicles/VehicleConfig.js';
import { TRACKS } from '../tracks/TrackManager.js';
import { formatTime } from '../game/utils.js';

export class MainMenu {
  constructor(root, game) {
    this.game = game;
    this.el = el(`
      <section class="screen menu" data-screen="menu">
        <div class="menu-left">
          ${LOGO('big')}
          <div class="tagline">ULTRA 3D RACING · BUILT FOR THE BROWSER</div>
          <nav class="menu-nav">
            <button class="mbtn primary" data-go="play"><span>PLAY</span><small>Race now with your current setup</small></button>
            <button class="mbtn" data-go="setup"><span>RACE SETUP</span><small>Modes · tracks · opponents</small></button>
            <button class="mbtn" data-go="garage"><span>GARAGE</span><small>20 cars · paint &amp; finish</small></button>
            <button class="mbtn" data-go="tracks"><span>TRACKS</span><small>Highway · Desert · Neon City</small></button>
            <button class="mbtn" data-go="modes"><span>GAME MODES</span><small>Circuit · Sprint · Time Trial · Drift · Free</small></button>
            <button class="mbtn" data-go="settings"><span>SETTINGS</span><small>Graphics · audio · controls</small></button>
            <button class="mbtn" data-go="credits"><span>CREDITS</span><small>About Cars x Aura</small></button>
          </nav>
          <div class="menu-credit">Created and developed by <b>Saif Ur Rehman</b><br><span>Student and aspiring game developer from Pakistan ${PK}</span></div>
        </div>
        <div class="menu-right">
          <div class="car-title"><small class="ct-brand"></small><h2 class="ct-name"></h2><span class="ct-cat"></span></div>
          <div class="records"></div>
        </div>
        <div class="menu-hint">Drag to rotate the car</div>
      </section>`);
    root.appendChild(this.el);
    this.el.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        game.audio.click();
        const go = b.dataset.go;
        if (go === 'play') game.quickRace();
        else if (go === 'setup') game.showScreen('setup');
        else if (go === 'tracks') game.showScreen('setup', { focus: 'tracks' });
        else if (go === 'modes') game.showScreen('setup', { focus: 'modes' });
        else if (go === 'garage') game.showScreen('garage');
        else if (go === 'settings') game.settingsUI.open();
        else if (go === 'credits') game.overlays.credits();
      }),
    );
  }

  show() {
    const g = this.game;
    const car = getVehicle(g.save.data.selectedCar);
    this.el.querySelector('.ct-brand').textContent = `Inspired by ${car.inspiredBy}`;
    this.el.querySelector('.ct-name').textContent = car.name;
    this.el.querySelector('.ct-cat').textContent = car.category;
    const rec = g.save.data.records;
    const laps = TRACKS.map((t) => {
      const b = g.save.data.bestLaps[t.id];
      return `<li><span>${esc(t.name)}</span><b>${b ? formatTime(b.time) : '—'}</b></li>`;
    }).join('');
    this.el.querySelector('.records').innerHTML = `
      <div class="rec-row"><div><b>${rec.races}</b><small>RACES</small></div><div><b>${rec.wins}</b><small>WINS</small></div><div><b>${rec.podiums}</b><small>PODIUMS</small></div><div><b>${rec.km}</b><small>KM</small></div></div>
      <ul class="rec-laps"><li class="h"><span>BEST LAPS</span></li>${laps}</ul>`;
  }
}
