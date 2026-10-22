// Browser-local persistence (localStorage). Every access is wrapped: private windows and blocked
// storage simply fall back to in-memory defaults, so the game never crashes because of saving.

const KEY = 'cxa.save.v1';
const GHOST_PREFIX = 'cxa.ghost.v1.';

export const DEFAULT_SETTINGS = Object.freeze({
  quality: 'auto', // auto | low | medium | high | ultra
  autoResolution: true,
  masterVolume: 0.8,
  engineVolume: 0.8,
  sfxVolume: 0.8,
  musicVolume: 0.3,
  steeringSensitivity: 1,
  controls: 'auto', // auto | keyboard | touch
  camera: 0,
  handling: 'arcade', // arcade | sport | pro
  units: 'kmh', // kmh | mph
  showFps: false,
});

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export class SaveManager {
  constructor() {
    const d = readJSON(KEY) || {};
    this.data = {
      settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
      selectedCar: typeof d.selectedCar === 'string' ? d.selectedCar : 'm5-aura',
      paints: d.paints && typeof d.paints === 'object' ? d.paints : {},
      bestLaps: d.bestLaps || {}, // trackId -> { time, car }
      bestTotals: d.bestTotals || {}, // `${track}:${mode}:${laps}` -> { time, car }
      driftBest: d.driftBest || {}, // trackId -> score
      records: { races: 0, wins: 0, podiums: 0, km: 0, ...(d.records || {}) },
      lastSetup: d.lastSetup || null,
    };
    this.available = writeJSON('cxa.probe', 1);
  }

  get settings() {
    return this.data.settings;
  }

  save() {
    return writeJSON(KEY, this.data);
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }

  resetSettings() {
    this.data.settings = { ...DEFAULT_SETTINGS };
    this.save();
  }

  getPaint(carId, fallback) {
    return { ...fallback, ...(this.data.paints[carId] || {}) };
  }

  setPaint(carId, paint) {
    this.data.paints[carId] = { color: paint.color, finish: paint.finish };
    this.save();
  }

  /** Returns true if this is a new record. */
  submitBestLap(trackId, time, carName) {
    const cur = this.data.bestLaps[trackId];
    if (!cur || time < cur.time) {
      this.data.bestLaps[trackId] = { time, car: carName };
      this.save();
      return true;
    }
    return false;
  }

  submitBestTotal(key, time, carName) {
    const cur = this.data.bestTotals[key];
    if (!cur || time < cur.time) {
      this.data.bestTotals[key] = { time, car: carName };
      this.save();
      return true;
    }
    return false;
  }

  submitDrift(trackId, score) {
    if (score > (this.data.driftBest[trackId] || 0)) {
      this.data.driftBest[trackId] = Math.round(score);
      this.save();
      return true;
    }
    return false;
  }

  addRaceRecord({ position, km }) {
    const r = this.data.records;
    r.races++;
    if (position === 1) r.wins++;
    if (position && position <= 3) r.podiums++;
    r.km = Math.round((r.km + (km || 0)) * 10) / 10;
    this.save();
  }

  getGhost(trackId) {
    const g = readJSON(GHOST_PREFIX + trackId);
    return g && Array.isArray(g.frames) ? g : null;
  }

  setGhost(trackId, ghost) {
    return writeJSON(GHOST_PREFIX + trackId, ghost);
  }
}
