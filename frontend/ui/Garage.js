// Garage: browse the 20 cars in the 3D showroom, compare stats and customise paint + finish.
import { el, esc, segmented } from './dom.js';
import { VEHICLES, BRANDS, PAINT_SWATCHES, FINISHES, statBars, ENGINE_LABEL, getVehicle } from '../vehicles/VehicleConfig.js';

export class Garage {
  constructor(root, game) {
    this.game = game;
    this.el = el(`
      <section class="screen garage" data-screen="garage">
        <header class="scr-head">
          <button class="back" data-act="back">‹ BACK</button>
          <h1>GARAGE</h1>
          <span class="count"></span>
        </header>
        <aside class="g-list" aria-label="Vehicles"></aside>
        <div class="g-info panel">
          <small class="g-brand"></small>
          <h2 class="g-name"></h2>
          <div class="g-cat"></div>
          <div class="g-stats"></div>
          <div class="g-specs"></div>
          <h3>PAINT</h3>
          <div class="swatches"></div>
          <label class="custom-color">Custom colour <input type="color" class="g-color" /></label>
          <h3>FINISH</h3>
          <div class="g-finish"></div>
          <p class="g-note">Original procedural model inspired by the body style named above. Not affiliated with any manufacturer.</p>
        </div>
        <div class="g-nav">
          <button class="round" data-act="prev" aria-label="Previous car">‹</button>
          <button class="cta" data-act="select">SELECT</button>
          <button class="cta hot" data-act="race">RACE ›</button>
          <button class="round" data-act="next" aria-label="Next car">›</button>
        </div>
      </section>`);
    root.appendChild(this.el);
    this.list = this.el.querySelector('.g-list');
    this._buildList();
    this.el.querySelector('.count').textContent = `${VEHICLES.length} CARS`;
    this.el.querySelector('[data-act=back]').addEventListener('click', () => this.close());
    this.el.querySelector('[data-act=prev]').addEventListener('click', () => this.step(-1));
    this.el.querySelector('[data-act=next]').addEventListener('click', () => this.step(1));
    this.el.querySelector('[data-act=select]').addEventListener('click', () => this.select(false));
    this.el.querySelector('[data-act=race]').addEventListener('click', () => this.select(true));
    const sw = this.el.querySelector('.swatches');
    for (const c of PAINT_SWATCHES) {
      const b = el(`<button class="swatch" style="--c:${c}" data-c="${c}" aria-label="Paint ${c}"></button>`);
      b.addEventListener('click', () => this.paint(c, null));
      sw.appendChild(b);
    }
    this.colorInput = this.el.querySelector('.g-color');
    this.colorInput.addEventListener('input', () => this.paint(this.colorInput.value, null));
    this.finishSeg = segmented(Object.entries(FINISHES).map(([k, f]) => ({ value: k, label: f.label })), 'metallic', (v) => this.paint(null, v));
    this.el.querySelector('.g-finish').appendChild(this.finishSeg);
    this.keyHandler = (e) => {
      if (!this.el.classList.contains('active')) return;
      if (e.code === 'ArrowLeft') this.step(-1);
      else if (e.code === 'ArrowRight') this.step(1);
      else if (e.code === 'Enter') this.select(false);
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  _buildList() {
    let h = '';
    for (const b of BRANDS) {
      const cars = VEHICLES.filter((v) => v.brand === b);
      if (!cars.length) continue;
      h += `<div class="g-brandhead">${esc(b === 'Cars x Aura' ? 'ORIGINAL' : b.toUpperCase() + '-INSPIRED')}</div>`;
      for (const v of cars) h += `<button class="g-item" data-id="${v.id}"><b>${esc(v.name)}</b><small>${esc(v.category)}</small></button>`;
    }
    this.list.innerHTML = h;
    this.list.querySelectorAll('.g-item').forEach((b) => b.addEventListener('click', () => this.preview(b.dataset.id)));
  }

  show(opts = {}) {
    this.returnTo = opts.returnTo || 'menu';
    this.preview(this.game.save.data.selectedCar);
  }

  preview(id) {
    const v = getVehicle(id);
    this.current = v;
    const paint = this.game.save.getPaint(v.id, v.paint);
    this.game.showroom.setCar(v, paint);
    this.list.querySelectorAll('.g-item').forEach((b) => b.classList.toggle('on', b.dataset.id === v.id));
    const item = this.list.querySelector(`[data-id="${v.id}"]`);
    if (item) item.scrollIntoView({ block: 'nearest' });
    this.el.querySelector('.g-brand').textContent = `Inspired by ${v.inspiredBy}`;
    this.el.querySelector('.g-name').textContent = v.name;
    this.el.querySelector('.g-cat').textContent = v.category;
    const s = statBars(v);
    const bar = (label, val) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${val}%"></i></div><b>${val}</b></div>`;
    this.el.querySelector('.g-stats').innerHTML = bar('TOP SPEED', s.speed) + bar('ACCELERATION', s.accel) + bar('HANDLING', s.handling) + bar('BRAKING', s.braking);
    const p = v.perf;
    this.el.querySelector('.g-specs').innerHTML = `
      <div><small>TOP SPEED</small><b>${p.top} km/h</b></div>
      <div><small>0-100</small><b>${p.accel.toFixed(1)} s</b></div>
      <div><small>ENGINE</small><b>${ENGINE_LABEL[v.engine] || v.engine}</b></div>
      <div><small>WEIGHT</small><b>${p.mass.toLocaleString()} kg</b></div>`;
    this._syncPaint(paint);
  }

  _syncPaint(paint) {
    this.el.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.c.toLowerCase() === String(paint.color).toLowerCase()));
    this.colorInput.value = /^#[0-9a-f]{6}$/i.test(paint.color) ? paint.color : '#ffffff';
    this.finishSeg.set(paint.finish);
  }

  paint(color, finish) {
    const v = this.current;
    const cur = this.game.save.getPaint(v.id, v.paint);
    const next = { color: color || cur.color, finish: finish || cur.finish };
    this.game.save.setPaint(v.id, next);
    this.game.showroom.setPaint(next.color, next.finish);
    this._syncPaint(next);
  }

  step(dir) {
    const i = VEHICLES.findIndex((v) => v.id === this.current.id);
    const n = VEHICLES[(i + dir + VEHICLES.length) % VEHICLES.length];
    this.game.audio.click();
    this.preview(n.id);
  }

  select(race) {
    this.game.audio.click();
    this.game.save.data.selectedCar = this.current.id;
    this.game.save.save();
    this.game.toast(`${this.current.name} selected`);
    if (race) this.game.quickRace();
    else this.game.showScreen(this.returnTo);
  }

  close() {
    this.game.audio.click();
    // put the selected car back on the turntable
    const v = getVehicle(this.game.save.data.selectedCar);
    this.game.showroom.setCar(v, this.game.save.getPaint(v.id, v.paint));
    this.game.showScreen(this.returnTo);
  }
}
