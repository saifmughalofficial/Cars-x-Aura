// Game orchestrator: renderer + post-processing, menu showroom, race lifecycle (load, play, pause,
// finish, results), fixed-step simulation, input routing, audio, HUD and adaptive quality.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SaveManager } from './SaveManager.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { GameLoop } from './GameLoop.js';
import { resolveQuality, AdaptiveResolution } from './Quality.js';
import { Environment } from './Environment.js';
import { Effects, SpeedLines } from './Effects.js';
import { CameraManager, CAMERA_MODES } from './CameraManager.js';
import { CollisionManager } from './CollisionManager.js';
import { AIController } from './AIController.js';
import { RaceManager, MODES } from './RaceManager.js';
import { Traffic } from './Traffic.js';
import { setMaxAnisotropy } from './textures.js';
import { clamp, rng, formatTime, isTouchDevice } from './utils.js';
import { Track } from '../tracks/TrackBuilder.js';
import { getTrackDef } from '../tracks/TrackManager.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { VEHICLES, PAINT_SWATCHES, getVehicle, perfIndex } from '../vehicles/VehicleConfig.js';
import { Showroom } from '../ui/Showroom.js';
import { HUD } from '../ui/HUD.js';
import { MainMenu } from '../ui/MainMenu.js';
import { Garage } from '../ui/Garage.js';
import { RaceSetup, DEFAULT_SETUP } from '../ui/RaceSetup.js';
import { Settings } from '../ui/Settings.js';
import { Overlays } from '../ui/Overlays.js';
import { TouchControls } from '../ui/TouchControls.js';

const DRIVERS = ['Ali Raza', 'Hamza Khan', 'Ayesha Malik', 'Bilal Ahmed', 'Zara Hussain', 'Usman Tariq', 'Fatima Noor', 'Danish Iqbal'];
const TIPS = [
  'Tap SPACE while steering to start a drift — drifting refills your nitro.',
  'Press C to cycle cameras: chase, close, front, hood, cockpit and cinematic.',
  'Hit the ramps flat out: airtime also charges nitro.',
  'Perfect start: hold the revs mid-range (not on the red line) as the countdown hits GO.',
  'Press R to put the car back on the road if you get stuck.',
  'Arcade handling is forgiving. Try Sport or Professional in Settings for more slide.',
  'Your best laps, settings and paint jobs are saved in this browser.',
];

const RadialBlurShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){ vec2 d = vUv - vec2(0.5, 0.47); vec4 c = vec4(0.0);
      for (int i = 0; i < 8; i++) { float t = float(i) / 7.0; c += texture2D(tDiffuse, vUv - d * strength * t); }
      gl_FragColor = c / 8.0; }`,
};

const _v2 = new THREE.Vector2();
const _hit = { x: 0, y: 0, z: 0 };
const _ghost = { x: 0, y: 0, z: 0, h: 0 };

export class Game {
  constructor(dom) {
    this.dom = dom;
    this.save = new SaveManager();
    this.input = new InputManager();
    this.audio = new AudioManager(this.save.settings);
    const qParam = new URLSearchParams(location.search).get('q'); // testing override, not saved
    this.quality = resolveQuality(qParam || this.save.settings.quality);
    this.state = 'boot';
    this.paused = false;
    this.race = null;
    this.cars = [];

    // ── renderer
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas, antialias: this.quality.antialias, powerPreference: 'high-performance', stencil: false,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = this.quality.shadows >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    setMaxAnisotropy(r.capabilities.getMaxAnisotropy());
    this.adaptive = new AdaptiveResolution(r, this.quality.maxPixelRatio);
    this.adaptive.enabled = this.save.settings.autoResolution;
    this.adaptive.onChange = () => this._resizeComposer();
    this.adaptive.apply();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 5000);
    this.cameraRig = new CameraManager(this.camera);
    this.showroom = new Showroom(r, this.quality);
    this.speedLines = new SpeedLines(dom.fxCanvas);

    // ── UI
    this.hud = new HUD(dom.hud, this);
    this.touch = new TouchControls(dom.touch, this.input);
    this.menu = new MainMenu(dom.screens, this);
    this.garage = new Garage(dom.screens, this);
    this.setup = new RaceSetup(dom.screens, this);
    this.settingsUI = new Settings(dom.screens, this);
    this.overlays = new Overlays(dom.screens, this);
    this.screens = { menu: this.menu, garage: this.garage, setup: this.setup };

    this._bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();

    const sel = getVehicle(this.save.data.selectedCar);
    this.showroom.setCar(sel, this.save.getPaint(sel.id, sel.paint));
    this.loop = new GameLoop({ update: (dt) => this.update(dt), render: (dt) => this.render(dt) });
    window.cxa = this; // debugging / automated tests
  }

  start() {
    this.loop.start();
    const params = new URLSearchParams(location.search);
    if (params.get('race')) {
      if (params.get('car')) this.save.data.selectedCar = getVehicle(params.get('car')).id;
      this.startRace({
        ...DEFAULT_SETUP,
        mode: MODES[params.get('race')] ? params.get('race') : 'circuit',
        track: params.get('track') || DEFAULT_SETUP.track,
        laps: parseInt(params.get('laps') || '3', 10),
        opponents: parseInt(params.get('opp') ?? '5', 10),
        difficulty: params.get('ai') || 'normal',
        traffic: params.get('traffic') === '1',
      });
    } else this.showScreen('menu');
    if (window.__embedded) this.toast('Click inside the game once so it receives keyboard input', 4500);
  }

  // ───────────────────────── screens ─────────────────────────
  showScreen(name, opts = {}) {
    this.state = 'menu';
    this.input.capture = false;
    for (const [k, s] of Object.entries(this.screens)) s.el.classList.toggle('active', k === name);
    this.currentScreen = name;
    this.showroom.setView(name);
    const s = this.screens[name];
    if (s && s.show) s.show(opts);
    if (name !== 'garage') {
      const v = getVehicle(this.save.data.selectedCar);
      this.showroom.setCar(v, this.save.getPaint(v.id, v.paint));
    }
    this.audio.music('menu');
    this.audio.setAmbience('menu');
  }

  hideScreens() {
    for (const s of Object.values(this.screens)) s.el.classList.remove('active');
    this.currentScreen = null;
  }

  toast(msg, ms = 1800) {
    const t = this.dom.toast;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), ms);
  }

  toggleFullscreen() {
    const d = document;
    try {
      if (!d.fullscreenElement && !d.webkitFullscreenElement) {
        const el = d.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      } else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } catch (e) {
      this.toast(window.__embedded ? 'Use the ⛶ button (top-right) to play full screen in a new tab' : 'Fullscreen is not available here');
    }
  }

  // ───────────────────────── input ─────────────────────────
  _bindInput() {
    const unlock = () => {
      this.audio.unlock();
      if (this.state === 'menu') this.audio.music('menu');
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.input.on('camera', () => {
      if (this.state === 'race' && !this.paused) this.toast('Camera: ' + this.cycleCamera(), 1000);
    });
    this.input.on('reset', () => {
      if (this.state === 'race' && !this.paused) this.resetPlayer();
    });
    this.input.on('pause', () => {
      if (this.settingsUI.isOpen) return this.settingsUI.close();
      if (this.state !== 'race' || this.race?.state === 'finished') return;
      if (this.paused) this.resume();
      else this.pause();
    });
    this.input.on('mute', () => this.toast(this.audio.toggleMute() ? 'Sound muted (M)' : 'Sound on', 1200));

    // drag: rotate showroom car or orbit chase camera
    const c = this.dom.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && this.state === 'race') return;
      drag = { x: e.clientX, y: e.clientY };
      c.focus?.();
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (this.state === 'menu') this.showroom.drag(dx, dy);
      else if (this.state === 'race' && this.cameraRig.mode <= 1) this.cameraRig.drag(dx, dy);
    });
    window.addEventListener('pointerup', () => (drag = null));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'race' && !this.paused && this.race?.state !== 'finished') this.pause();
        this.audio.suspend();
      } else this.audio.resume();
    });
  }

  cycleCamera() {
    return this.cameraRig.next();
  }

  cameraName() {
    return CAMERA_MODES[this.cameraRig.mode];
  }

  useTouch() {
    const c = this.save.settings.controls;
    return c === 'touch' || (c === 'auto' && isTouchDevice());
  }

  applySettings(rebuild) {
    const s = this.save.settings;
    this.audio.settings = s;
    this.audio.applyVolumes();
    this.adaptive.enabled = s.autoResolution;
    if (!s.autoResolution) {
      this.adaptive.scale = 1;
      this.adaptive.apply();
    }
    if (this.player) {
      this.player.phys.setHandling(s.handling);
      this.player.phys.steerSens = s.steeringSensitivity;
      this.touch.show(this.state === 'race' && !this.paused && this.useTouch());
    }
    if (rebuild) {
      const q = resolveQuality(s.quality);
      if (q.key !== this.quality.key) {
        this.quality = q;
        this.adaptive.setMax(q.maxPixelRatio);
        this.renderer.shadowMap.type = q.shadows >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        if (this.trackDef) this._setupComposer(this.trackDef.env);
        this.toast(`Graphics: ${q.label}${this.state === 'race' ? ' — full effect from the next race' : ''}`);
      }
    }
  }

  // ───────────────────────── race lifecycle ─────────────────────────
  quickRace() {
    const setup = { ...DEFAULT_SETUP, ...(this.save.data.lastSetup || {}) };
    this.startRace(setup);
  }

  async startRace(setup) {
    if (this.state === 'loading') return;
    this.raceSetup = setup;
    this.state = 'loading';
    this.hideScreens();
    this.overlays.hideAll();
    const def = getTrackDef(setup.track);
    this.trackDef = def;
    this.overlays.showLoading(def.name, TIPS[Math.floor(Math.random() * TIPS.length)]);
    this._teardownRace();
    await new Promise((r) => setTimeout(r, 30));
    try {
      await this._buildRace(setup, def);
    } catch (err) {
      console.error(err);
      this.overlays.hideLoading();
      this._teardownRace();
      this.showScreen('menu');
      this.toast('Could not start the race: ' + err.message, 5000);
      return;
    }
  }

  async _buildRace(setup, def) {
    const q = this.quality;
    const prog = (p, m) => this.overlays.progress(p, m);
    this.track = await Track.build(def, q, (p, m) => prog(p * 0.75, m));
    this.scene.add(this.track.group);
    this.env = new Environment(this.renderer, this.scene, def.env, q);
    this.renderer.toneMappingExposure = def.env.exposure || 1;
    this.effects = new Effects(this.scene, q);
    this.effects.setTrackStyle(def.env, def.road.shoulderKind);
    this.collisions = new CollisionManager(this.track);
    prog(0.8, 'Rolling out the cars');
    await new Promise((r) => setTimeout(r, 0));

    const night = !!def.env.night;
    const s = this.save.settings;
    const pcfg = getVehicle(this.save.data.selectedCar);
    const player = new Vehicle(pcfg, { paint: this.save.getPaint(pcfg.id, pcfg.paint), quality: q, isPlayer: true, night });
    player.attach(this.track, s.handling);
    player.phys.steerSens = s.steeringSensitivity;
    player.driver = 'YOU';
    this.player = player;
    const cars = [player];
    const M = MODES[setup.mode];
    const rand = rng((Date.now() & 0xffff) + 7);
    if (M.ai) {
      const n = clamp(setup.opponents | 0, 0, 7);
      const pi = perfIndex(pcfg);
      const pool = VEHICLES.filter((v) => v.id !== pcfg.id)
        .map((v) => ({ v, d: Math.abs(perfIndex(v) - pi) + rand() * 14 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, n);
      pool.forEach(({ v }, i) => {
        const paint = rand() < 0.5 ? { ...v.paint } : { color: PAINT_SWATCHES[Math.floor(rand() * PAINT_SWATCHES.length)], finish: rand() < 0.5 ? 'metallic' : 'gloss' };
        const car = new Vehicle(v, { paint, quality: q, night });
        car.attach(this.track, 'arcade');
        car.driver = DRIVERS[i % DRIVERS.length];
        car.ai = new AIController(car, this.track, setup.difficulty, rand);
        cars.push(car);
      });
    }
    for (const c of cars) this.scene.add(c.root);
    this.cars = cars;

    // headlight for the player at night
    if (night && q.headlightSpot) {
      const spot = new THREE.SpotLight('#fff1d6', 260, 80, 0.5, 0.55, 1.3);
      spot.position.set(0, 0.75, pcfg.dims.L / 2);
      spot.target.position.set(0, 0, pcfg.dims.L / 2 + 22);
      player.model.bodyInner.add(spot, spot.target);
      this.headSpot = spot;
    }

    // time-trial ghost
    let ghostData = null;
    if (setup.mode === 'timetrial') {
      ghostData = this.save.getGhost(def.id);
      if (ghostData) this._makeGhost(ghostData);
    }

    // traffic on the highway
    const solid = setup.traffic && def.traffic && (M.ai || setup.mode === 'free') ? 10 : 0;
    if (def.oppositeRoad) this.traffic = new Traffic(this.scene, this.track, { count: solid, oncoming: q.key === 'low' ? 5 : 10 });

    this.race = new RaceManager({ mode: setup.mode, laps: setup.laps, track: this.track, cars, player, ghostData, hooks: this._hooks() });
    if (setup.mode === 'sprint') {
      const t = this.track;
      this.extraGates = [
        t.buildGate(t.sprint.start, 'SPRINT START', def.gateColor || '#22e6ff', 'GO GO GO'),
        t.buildGate(t.sprint.start + t.sprint.length, 'FINISH', '#ffcf5a', 'SPRINT FINISH'),
      ];
      for (const g of this.extraGates) this.scene.add(g);
    }
    this.race.setupGrid();
    for (const c of cars) c.update(0);

    this.cameraRig.attach(player, this.track);
    this.cameraRig.setMode(s.camera | 0);
    if (this.race.state === 'intro') this.cameraRig.intro(this.race.introDur + 0.4);
    else this.cameraRig.drive();
    this._setupComposer(def.env);
    this.resize();
    prog(0.92, 'Warming up shaders');
    await new Promise((r) => setTimeout(r, 0));
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      /* compile is an optimisation only */
    }
    prog(1, 'Ready');
    this.overlays.hideLoading();
    this.hud.show(this.race);
    this.touch.show(this.useTouch());
    this.audio.setEngine(pcfg.engine);
    this.audio.engineActive(true);
    this.audio.setAmbience(def.env.ambience);
    this.audio.music('race');
    this.paused = false;
    this.autopilot = null;
    this.resultsT = 0;
    this.stuckT = 0;
    this.stats = { aiResets: 0, wallHits: 0, carHits: 0 };
    this.prevNitro = false;
    this.input.capture = true;
    this.state = 'race';
    document.body.classList.add('racing');
    if (setup.mode === 'free') this.hud.notify('FREE DRIVE — press Esc for the menu', 'info', 2600);
  }

  _makeGhost(data) {
    if (this.ghostCar) this.ghostCar.dispose();
    const cfg = getVehicle(data.car);
    this.ghostCar = new Vehicle(cfg, { quality: this.quality, ghost: true });
    this.ghostCar.root.visible = false;
    this.scene.add(this.ghostCar.root);
  }

  _hooks() {
    return {
      countdown: (n) => {
        this.hud.countdown(n);
        this.audio.countdown(n);
        if (n === 3) this.cameraRig.drive();
      },
      go: () => {},
      notify: (t, k) => this.hud.notify(t, k),
      checkpoint: (t, k) => {
        this.hud.notify(t, k, 1400);
        this.audio.checkpoint();
      },
      lap: (lapTime, done, laps) => {
        const r = this.player.race;
        this.audio.lap();
        this.hud.notify(`LAP ${formatTime(lapTime)}`, lapTime === r.bestLap && done > 1 ? 'good' : 'info', 2200);
        if (done < laps) this.hud.notify(done === laps - 1 ? 'FINAL LAP' : `LAP ${done + 1}/${laps}`, 'info', 2000);
      },
      newGhost: (g) => {
        if (this.save.setGhost(this.track.id, g)) this.hud.notify('NEW GHOST SAVED', 'good');
        if (!this.ghostCar || this.ghostCar.cfg.id !== g.car) this._makeGhost(g);
      },
      driftBank: (pts) => {
        this.hud.notify(`DRIFT +${pts.toLocaleString()}`, 'good', 1300);
        this.audio.drift(pts);
      },
      playerFinished: () => {
        const pos = this.player.race.position;
        this.audio.finish(pos === 1 || !this.race.M.ai);
        this.hud.notify(this.race.M.ai ? (pos === 1 ? 'YOU WIN!' : `FINISHED ${pos}`) : 'FINISHED', 'good', 2600);
        this.autopilot = new AIController(this.player, this.track, 'easy');
        this.resultsT = 3.2;
        setTimeout(() => this.state === 'race' && this.cameraRig.orbit(), 1100);
      },
    };
  }

  _showResults() {
    const res = this.race.results();
    const badges = [];
    const carName = this.player.cfg.name;
    const tid = this.track.id;
    const mode = this.race.mode;
    const sv = this.save;
    if (res.bestLap && (mode === 'circuit' || mode === 'timetrial') && sv.submitBestLap(tid, res.bestLap, carName)) badges.push('NEW BEST LAP · ' + this.track.name);
    if (mode === 'timetrial' && sv.submitBestTotal(`${tid}:timetrial:${res.laps}`, res.time, carName)) badges.push('NEW TIME TRIAL RECORD');
    if (mode === 'sprint' && sv.submitBestTotal(`${tid}:sprint`, res.time, carName)) badges.push('NEW SPRINT RECORD');
    if (mode === 'drift' && sv.submitDrift(tid, res.driftScore)) badges.push('NEW DRIFT RECORD');
    if (this.race.M.ai) {
      sv.addRaceRecord({ position: res.position, km: res.km });
      if (res.position === 1) badges.unshift('VICTORY');
      else if (res.position <= 3) badges.unshift('PODIUM');
    } else {
      sv.data.records.km = Math.round((sv.data.records.km + res.km) * 10) / 10;
      sv.save();
    }
    this.hud.hide();
    this.touch.show(false);
    this.input.capture = false;
    this.overlays.showResults(res, badges);
  }

  pause() {
    if (this.state !== 'race' || this.paused) return;
    this.paused = true;
    this.input.releaseAll();
    this.audio.engineActive(false);
    this.overlays.showPause(true);
    this.touch.show(false);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.overlays.showPause(false);
    this.audio.engineActive(true);
    this.touch.show(this.useTouch());
    this.loop.last = performance.now();
  }

  restartRace() {
    this.overlays.hideAll();
    this.paused = false;
    this.startRace(this.raceSetup || DEFAULT_SETUP);
  }

  quitToMenu(screen = 'menu') {
    this.overlays.hideAll();
    this.paused = false;
    this._teardownRace();
    this.showScreen(screen);
  }

  resetPlayer() {
    const p = this.player.phys;
    if (p.frozen) return;
    const n = p.nitro;
    const d = clamp(p.q.d, -this.track.hw + 2, this.track.hw - 2);
    p.placeAt(p.q.s, d);
    p.nitro = n;
    this.player.race && (this.player.race.lastS = p.q.s);
    this.effects.skids.last.clear();
    this.hud.notify('RESET', 'info', 900);
  }

  _resetCar(car) {
    const p = car.phys;
    this.stats.aiResets++;
    const d = clamp(car.ai ? car.ai.offset : 0, -this.track.hw + 2, this.track.hw - 2);
    p.placeAt(p.q.s + 2, d);
  }

  _teardownRace() {
    document.body.classList.remove('racing');
    this.hud.hide();
    this.touch.show(false);
    this.audio.engineActive(false);
    this.input.capture = false;
    for (const c of this.cars) c.dispose();
    this.cars = [];
    this.player = null;
    if (this.ghostCar) {
      this.ghostCar.dispose();
      this.ghostCar = null;
    }
    if (this.traffic) {
      this.traffic.dispose();
      this.traffic = null;
    }
    if (this.extraGates) {
      for (const g of this.extraGates) {
        this.scene.remove(g);
        g.userData.dispose && g.userData.dispose();
      }
      this.extraGates = null;
    }
    if (this.effects) {
      this.effects.dispose();
      this.effects = null;
    }
    if (this.env) {
      this.env.dispose();
      this.env = null;
    }
    if (this.track) {
      this.track.dispose();
      this.track = null;
    }
    this.headSpot = null;
    this.race = null;
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.speedLines.draw(1, 0, false);
  }

  _setupComposer(env) {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.blurPass = null;
    if (!this.quality.bloom) return;
    const r = this.renderer;
    const composer = new EffectComposer(r);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const b = env.bloom || { strength: 0.4, threshold: 0.85, radius: 0.4 };
    r.getSize(_v2);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(_v2.x, _v2.y), b.strength, b.radius, b.threshold);
    composer.addPass(this.bloom);
    if (this.quality.motionBlur) {
      this.blurPass = new ShaderPass(RadialBlurShader);
      this.blurPass.enabled = false;
      composer.addPass(this.blurPass);
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
    this._resizeComposer();
  }

  _resizeComposer() {
    if (!this.composer) return;
    this.renderer.getSize(_v2);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(_v2.x, _v2.y);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.speedLines.resize(w, h);
    this._resizeComposer();
  }

  // ───────────────────────── simulation ─────────────────────────
  update(dt) {
    if (this.state !== 'race' || this.paused || !this.race) return;
    const race = this.race, player = this.player, pp = player.phys;
    const inp = this.input.read();
    if (this.autopilot) {
      this.autopilot.update(dt, this.cars, null);
      player.input.nitro = false;
    } else {
      const pi = player.input;
      pi.throttle = inp.throttle;
      pi.brake = inp.brake;
      pi.steer = inp.steer;
      pi.handbrake = inp.handbrake;
      pi.nitro = inp.nitro;
    }
    for (const car of this.cars) {
      if (car.ai && car.ai.update(dt, this.cars, player) === 'reset' && race.racing) this._resetCar(car);
    }
    for (const car of this.cars) car.phys.step(dt, car.input);
    if (this.traffic) this.traffic.step(dt, pp.q.s);

    // walls
    for (const car of this.cars) {
      const imp = this.collisions.wall(car.phys, _hit);
      if (imp > 2) {
        this.stats.wallHits++;
        const near = car === player || this.camera.position.distanceToSquared(car.root.position) < 3600;
        if (near && this.effects) this.effects.sparkBurst(_hit.x, _hit.y, _hit.z, car.phys.vx, car.phys.vz, imp);
        if (car === player) {
          if (imp > 6) this.audio.impact(imp);
          else this.audio.scrape(imp);
          this.cameraRig.shake(Math.min(0.8, imp * 0.05));
          race.crash(imp);
        }
      }
    }
    if (this.traffic) for (const b of this.traffic.bodies) this.collisions.wall(b);
    const bodies = this._bodies || (this._bodies = []);
    bodies.length = 0;
    for (const c of this.cars) bodies.push(c.phys);
    if (this.traffic) for (const b of this.traffic.bodies) bodies.push(b);
    this.collisions.bodies(bodies, (a, b, impact, x, z) => {
      const involved = a === pp || b === pp;
      this.stats.carHits++;
      if (this.effects && (involved || this.camera.position.distanceToSquared(new THREE.Vector3(x, pp.y, z)) < 3600)) this.effects.sparkBurst(x, a.y, z, (a.vx + b.vx) / 2, (a.vz + b.vz) / 2, impact);
      if (involved) {
        this.audio.impact(impact);
        this.cameraRig.shake(Math.min(1, impact * 0.06));
        race.crash(impact);
      }
    });
    race.step(dt);

    if (pp.landImpact > 3) {
      this.audio.land(pp.landImpact);
      this.cameraRig.shake(Math.min(0.7, pp.landImpact * 0.05));
    }
    if (pp.nitroActive && !this.prevNitro) this.audio.nitro();
    this.prevNitro = pp.nitroActive;
    // stuck hint
    if (race.racing && pp.speed < 1 && inp.throttle > 0) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
  }

  // ───────────────────────── rendering ─────────────────────────
  render(dt) {
    const r = this.renderer;
    if (this.state === 'menu') {
      this.showroom.update(dt);
      this.showroom.render(r);
      return;
    }
    if (this.state !== 'race' || !this.race) return;
    this.adaptive.tick(dt);
    const race = this.race, player = this.player, pp = player.phys;
    if (!this.paused) {
      for (const c of this.cars) c.update(dt);
      if (this.traffic) this.traffic.update();
      if (this.ghostCar) {
        const g = race.ghostPose(_ghost);
        this.ghostCar.root.visible = !!g;
        if (g) {
          this.ghostCar.root.position.set(g.x, g.y, g.z);
          this.ghostCar.root.rotation.set(0, g.h, 0);
        }
      }
      this.cameraRig.update(dt);
      for (const c of this.cars) {
        const near = c === player || this.camera.position.distanceToSquared(c.root.position) < 14400;
        this.effects.carEffects(c, dt, near);
      }
      this.effects.ambient(dt, this.camera);
      this.effects.update(dt);
      this.env.update(this.camera, player.root.position);
      if (this.resultsT > 0) {
        this.resultsT -= dt;
        if (this.resultsT <= 0) this._showResults();
      }
    }
    // HUD + audio
    if (!this.hud.root.classList.contains('hidden')) {
      this.hud.update(dt, { race, player, units: this.save.settings.units, fps: this.adaptive.fps, showFps: this.save.settings.showFps, cars: this.cars });
      this.hud.hint(this.stuckT > 2.5 ? (this.useTouch() ? 'Stuck? Tap ↺ to reset' : 'Stuck? Press R to reset') : '');
    }
    if (!this.paused) {
      this.audio.updateDrive({
        rpmFrac: (pp.rpm - pp.idle) / (pp.redline - pp.idle), throttle: player.input.throttle, speed: pp.speed,
        slip: pp.slip, nitro: pp.nitroActive, airborne: !pp.grounded,
      });
    }
    const speedK = clamp((pp.speed - pp.vTop * 0.55) / (pp.vTop * 0.45), 0, 1);
    const internal = this.cameraRig.mode === 3 || this.cameraRig.mode === 4;
    this.speedLines.draw(dt, this.paused || this.cameraRig.state !== 'drive' ? 0 : speedK * 0.7 + (pp.nitroActive ? 0.55 : 0) * (internal ? 0.6 : 1), pp.nitroActive);
    r.getDrawingBufferSize(_v2);
    this.effects.setViewport(_v2.y, this.camera.fov);
    if (this.composer) {
      if (this.blurPass) {
        const s = pp.nitroActive ? 0.06 : speedK * 0.025;
        this.blurPass.enabled = s > 0.004 && !this.paused;
        this.blurPass.uniforms.strength.value = s;
      }
      this.composer.render(dt);
    } else r.render(this.scene, this.camera);
  }
}
