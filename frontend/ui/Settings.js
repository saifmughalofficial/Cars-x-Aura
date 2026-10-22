// Settings dialog (usable from the main menu and the pause menu). Everything is saved locally.
import { el, segmented } from './dom.js';
import { PRESETS, QUALITY_ORDER, detectQuality, getGPUInfo } from '../game/Quality.js';
import { HANDLING } from '../game/VehiclePhysics.js';
import { CAMERA_MODES } from '../game/CameraManager.js';

export class Settings {
  constructor(root, game) {
    this.game = game;
    this.el = el(`
      <div class="modal settings hidden" role="dialog" aria-label="Settings">
        <div class="modal-box panel">
          <header><h2>SETTINGS</h2><button class="x" data-act="close" aria-label="Close">✕</button></header>
          <div class="set-body">
            <section><h3>GRAPHICS</h3>
              <div class="row"><span>Quality</span><div class="r-quality"></div></div>
              <div class="row"><span>Adaptive resolution</span><div class="r-autores"></div></div>
              <div class="row"><span>Show FPS</span><div class="r-fps"></div></div>
              <p class="note r-gpu"></p>
            </section>
            <section><h3>AUDIO</h3>
              <div class="row"><span>Master volume</span><input type="range" min="0" max="1" step="0.05" data-k="masterVolume"></div>
              <div class="row"><span>Engine volume</span><input type="range" min="0" max="1" step="0.05" data-k="engineVolume"></div>
              <div class="row"><span>Effects volume</span><input type="range" min="0" max="1" step="0.05" data-k="sfxVolume"></div>
              <div class="row"><span>Music volume</span><input type="range" min="0" max="1" step="0.05" data-k="musicVolume"></div>
            </section>
            <section><h3>CONTROLS</h3>
              <div class="row"><span>Controls</span><div class="r-controls"></div></div>
              <div class="row"><span>Steering sensitivity</span><input type="range" min="0.6" max="1.4" step="0.05" data-k="steeringSensitivity"></div>
              <div class="row"><span>Handling</span><div class="r-handling"></div></div>
              <div class="row"><span>Default camera</span><select class="r-camera"></select></div>
              <div class="row"><span>Speed units</span><div class="r-units"></div></div>
              <p class="note">Keyboard: W/↑ accelerate · S/↓ brake/reverse · A D/← → steer · Space handbrake · Shift nitro · C camera · R reset · Esc pause · M mute. Gamepads work too.</p>
            </section>
            <section><h3>DISPLAY</h3>
              <div class="row"><span>Fullscreen</span><button class="ghost-btn" data-act="fs">TOGGLE FULLSCREEN</button></div>
              <div class="row"><span>Progress</span><span class="note">Saved in this browser only — it does not transfer between browsers or devices.</span></div>
              <div class="row"><span></span><button class="ghost-btn danger" data-act="reset">RESET SETTINGS</button></div>
            </section>
          </div>
        </div>
      </div>`);
    root.appendChild(this.el);
    const $ = (s) => this.el.querySelector(s);
    $('[data-act=close]').addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
    $('[data-act=fs]').addEventListener('click', () => game.toggleFullscreen());
    $('[data-act=reset]').addEventListener('click', () => {
      game.save.resetSettings();
      game.applySettings(true);
      this.refresh();
      game.toast('Settings reset');
    });
    this.el.querySelectorAll('input[type=range]').forEach((r) =>
      r.addEventListener('input', () => {
        game.save.setSetting(r.dataset.k, parseFloat(r.value));
        game.applySettings(false);
      }),
    );
    const s = game.save.settings;
    const auto = detectQuality();
    this.quality = segmented(
      [{ value: 'auto', label: `Auto (${PRESETS[auto].label})` }, ...QUALITY_ORDER.map((k) => ({ value: k, label: PRESETS[k].label }))],
      s.quality,
      (v) => {
        game.save.setSetting('quality', v);
        game.applySettings(true);
      },
    );
    $('.r-quality').appendChild(this.quality);
    this.autores = segmented([{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], s.autoResolution ? 'on' : 'off', (v) => {
      game.save.setSetting('autoResolution', v === 'on');
      game.applySettings(false);
    });
    $('.r-autores').appendChild(this.autores);
    this.fps = segmented([{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], s.showFps ? 'on' : 'off', (v) => game.save.setSetting('showFps', v === 'on'));
    $('.r-fps').appendChild(this.fps);
    this.controls = segmented(
      [{ value: 'auto', label: 'Auto' }, { value: 'keyboard', label: 'Keyboard' }, { value: 'touch', label: 'Touch' }],
      s.controls,
      (v) => {
        game.save.setSetting('controls', v);
        game.applySettings(false);
      },
    );
    $('.r-controls').appendChild(this.controls);
    this.handling = segmented(Object.entries(HANDLING).map(([k, h]) => ({ value: k, label: h.label })), s.handling, (v) => {
      game.save.setSetting('handling', v);
      game.applySettings(false);
    });
    $('.r-handling').appendChild(this.handling);
    this.units = segmented([{ value: 'kmh', label: 'km/h' }, { value: 'mph', label: 'mph' }], s.units, (v) => game.save.setSetting('units', v));
    $('.r-units').appendChild(this.units);
    const cam = $('.r-camera');
    CAMERA_MODES.forEach((m, i) => cam.appendChild(el(`<option value="${i}">${m}</option>`)));
    cam.addEventListener('change', () => game.save.setSetting('camera', parseInt(cam.value, 10)));
    const gpu = getGPUInfo();
    $('.r-gpu').textContent = `GPU: ${gpu.renderer}${gpu.webgl2 ? ' · WebGL 2' : ' · WebGL 1'}. Changing quality rebuilds the scene; anti-aliasing changes apply after a reload.`;
  }

  refresh() {
    const s = this.game.save.settings;
    this.quality.set(s.quality);
    this.autores.set(s.autoResolution ? 'on' : 'off');
    this.fps.set(s.showFps ? 'on' : 'off');
    this.controls.set(s.controls);
    this.handling.set(s.handling);
    this.units.set(s.units);
    this.el.querySelector('.r-camera').value = String(s.camera);
    this.el.querySelectorAll('input[type=range]').forEach((r) => (r.value = s[r.dataset.k]));
  }

  open() {
    this.refresh();
    this.el.classList.remove('hidden');
    this.game.audio.click();
  }

  close() {
    this.el.classList.add('hidden');
    this.game.audio.click();
    if (this.onClose) this.onClose();
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }
}
