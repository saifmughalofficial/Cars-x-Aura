// Graphics presets + hardware detection + adaptive resolution.

export const PRESETS = {
  low: {
    label: 'Low', maxPixelRatio: 1, shadows: 0, particles: 160, bloom: false, motionBlur: false,
    scenery: 0.45, terrainStep: 12, physical: false, headlightSpot: false, skidMarks: 160, antialias: false,
  },
  medium: {
    label: 'Medium', maxPixelRatio: 1, shadows: 1024, particles: 380, bloom: false, motionBlur: false,
    scenery: 0.75, terrainStep: 8, physical: false, headlightSpot: true, skidMarks: 320, antialias: true,
  },
  high: {
    label: 'High', maxPixelRatio: 1.5, shadows: 2048, particles: 800, bloom: true, motionBlur: false,
    scenery: 1, terrainStep: 6, physical: true, headlightSpot: true, skidMarks: 600, antialias: true,
  },
  ultra: {
    label: 'Ultra', maxPixelRatio: 2, shadows: 4096, particles: 1400, bloom: true, motionBlur: true,
    scenery: 1.3, terrainStep: 5, physical: true, headlightSpot: true, skidMarks: 900, antialias: true,
  },
};

export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

let gpuInfo = null;

export function getGPUInfo() {
  if (gpuInfo) return gpuInfo;
  let renderer = 'unknown';
  let webgl2 = false;
  try {
    const c = document.createElement('canvas');
    let gl = c.getContext('webgl2');
    webgl2 = !!gl;
    if (!gl) gl = c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch (e) {
    /* ignore */
  }
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  gpuInfo = { renderer: String(renderer), webgl2, mobile };
  return gpuInfo;
}

/** Choose a sensible starting preset for this device. */
export function detectQuality() {
  const { renderer, mobile } = getGPUInfo();
  const r = renderer.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(r)) return 'low';
  if (mobile) return 'low';
  if (/apple m\d|apple gpu/.test(r)) return 'high';
  if (/intel|uhd|hd graphics|iris|mali|adreno|powervr/.test(r)) return 'medium';
  if (/nvidia|geforce|rtx|gtx|radeon|amd/.test(r)) {
    if (/rtx|rx [67]\d{3}|rx 9\d{3}/.test(r)) return 'ultra';
    return 'high';
  }
  const cores = navigator.hardwareConcurrency || 4;
  return cores >= 8 ? 'high' : 'medium';
}

export function resolveQuality(setting) {
  const key = setting === 'auto' || !PRESETS[setting] ? detectQuality() : setting;
  return { key, ...PRESETS[key] };
}

/**
 * Lowers the render scale when FPS drops and restores it when there is headroom.
 * Only touches the pixel ratio, so it is cheap and never rebuilds the scene.
 */
export class AdaptiveResolution {
  constructor(renderer, maxRatio) {
    this.renderer = renderer;
    this.max = Math.min(window.devicePixelRatio || 1, maxRatio);
    this.scale = 1;
    this.enabled = true;
    this.frames = 0;
    this.time = 0;
    this.good = 0;
    this.fps = 60;
    this.onChange = null;
  }

  setMax(maxRatio) {
    this.max = Math.min(window.devicePixelRatio || 1, maxRatio);
    this.scale = 1;
    this.apply();
  }

  apply() {
    this.renderer.setPixelRatio(Math.max(0.5, this.max * this.scale));
    if (this.onChange) this.onChange();
  }

  /** Call once per rendered frame with the real frame time. */
  tick(dt) {
    this.frames++;
    this.time += dt;
    if (this.time < 1.5) return;
    this.fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (!this.enabled) return;
    if (this.fps < 48 && this.scale > 0.6) {
      this.scale = Math.max(0.6, this.scale - 0.1);
      this.good = 0;
      this.apply();
    } else if (this.fps > 58 && this.scale < 1) {
      if (++this.good >= 4) {
        this.scale = Math.min(1, this.scale + 0.1);
        this.good = 0;
        this.apply();
      }
    } else {
      this.good = 0;
    }
  }
}
