// Every texture in the game is drawn procedurally on a <canvas> at load time: no image downloads,
// no licensing questions, and sizes are kept small (<= 1024px) for weak GPUs.
import * as THREE from 'three';
import { rng } from './utils.js';

let maxAniso = 4;
export function setMaxAnisotropy(n) {
  maxAniso = Math.max(1, Math.min(8, n || 1));
}

const cache = new Map();

export function canvasTexture(w, h, draw, { repeat = null, srgb = true, aniso = true, key = null, mipmaps = true } = {}) {
  if (key && cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.generateMipmaps = mipmaps;
  if (aniso) t.anisotropy = maxAniso;
  if (key) {
    t.userData.shared = true;
    cache.set(key, t);
  }
  return t;
}

/** Fill with grainy noise around a base colour. */
function grain(ctx, w, h, base, spread, seed = 1, alpha = 1) {
  const r = rng(seed);
  const img = ctx.createImageData(w, h);
  const [br, bg, bb] = hexRGB(base);
  for (let i = 0; i < w * h; i++) {
    const n = (r() - 0.5) * spread + (r() - 0.5) * spread * 0.5;
    img.data[i * 4] = br + n;
    img.data[i * 4 + 1] = bg + n;
    img.data[i * 4 + 2] = bb + n;
    img.data[i * 4 + 3] = 255 * alpha;
  }
  ctx.putImageData(img, 0, 0);
}

export function hexRGB(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function blotches(ctx, w, h, color, count, rmin, rmax, alpha, seed) {
  const r = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * (0.4 + r() * 0.6);
    ctx.beginPath();
    const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin);
    ctx.ellipse(x, y, rad, rad * (0.5 + r()), r() * 3, 0, Math.PI * 2);
    ctx.fill();
    // wrap so tiles seamlessly
    if (x < rad || x > w - rad || y < rad || y > h - rad) {
      ctx.beginPath();
      ctx.ellipse((x + w / 2) % w, (y + h / 2) % h, rad, rad, 0, 0, Math.PI * 2);
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Road surface. u spans the road width (0 = left edge), v runs along the road; one texture repeat
 * covers `lengthM` metres. Lane markings are painted in.
 */
export function roadTexture({ lanes = 3, base = '#3a3c40', edge = '#f2f2f2', lane = '#f2f2f2', center = null, wet = false, seed = 3, key }) {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    grain(ctx, w, h, base, 26, seed);
    blotches(ctx, w, h, wet ? '#14161c' : '#2c2e31', 70, 6, 40, 0.18, seed + 1);
    blotches(ctx, w, h, '#55575c', 40, 3, 14, 0.12, seed + 2);
    // tyre-polished lanes
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#16171a';
    for (let l = 0; l < lanes; l++) {
      const cx = ((l + 0.5) / lanes) * w;
      ctx.fillRect(cx - w / lanes * 0.3, 0, w / lanes * 0.14, h);
      ctx.fillRect(cx + w / lanes * 0.16, 0, w / lanes * 0.14, h);
    }
    ctx.globalAlpha = 1;
    const line = (x, color, dashed, width = 9) => {
      ctx.fillStyle = color;
      if (!dashed) ctx.fillRect(x - width / 2, 0, width, h);
      else for (let y = 0; y < h; y += 256) ctx.fillRect(x - width / 2, y + 40, width, 150);
    };
    line(14, edge, false, 10);
    line(w - 14, edge, false, 10);
    for (let l = 1; l < lanes; l++) {
      const x = (l / lanes) * w;
      if (center && l === lanes / 2) {
        line(x - 7, center, false, 6);
        line(x + 7, center, false, 6);
      } else line(x, lane, true, 8);
    }
    // worn paint
    ctx.globalAlpha = 0.25;
    blotches(ctx, w, h, base, 50, 2, 6, 0.6, seed + 4);
    ctx.globalAlpha = 1;
  }, { repeat: [1, 1], key });
}

export function surfaceTexture(kind, key) {
  const specs = {
    gravel: ['#7a6f5d', 50, '#5a5246', '#a49883'],
    sand: ['#d4a46a', 26, '#b9844e', '#e8c48e'],
    grass: ['#5c7a32', 40, '#486326', '#7f9b45'],
    concrete: ['#8d8d8b', 22, '#7a7a78', '#a5a5a2'],
    sidewalk: ['#5a5560', 18, '#4a4650', '#6e6875'],
    dirt: ['#7a5a3c', 34, '#644830', '#94714e'],
  };
  const [base, spread, dark, light] = specs[kind] || specs.gravel;
  return canvasTexture(256, 256, (ctx, w, h) => {
    grain(ctx, w, h, base, spread, kind.length * 7);
    blotches(ctx, w, h, dark, 50, 4, 22, 0.3, 11);
    blotches(ctx, w, h, light, 40, 2, 10, 0.25, 12);
    if (kind === 'sidewalk') {
      ctx.strokeStyle = 'rgba(20,18,24,0.6)';
      ctx.lineWidth = 2;
      for (let y = 0; y <= h; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let x = 0; x <= w; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }
  }, { repeat: [1, 1], key: key || 'surf-' + kind });
}

/** Detail texture multiplied over terrain vertex colours. */
export function terrainDetailTexture(kind = 'grass') {
  return canvasTexture(256, 256, (ctx, w, h) => {
    grain(ctx, w, h, '#c8c8c8', kind === 'sand' ? 30 : 70, 99);
    blotches(ctx, w, h, '#9a9a9a', 60, 4, 26, 0.35, 5);
    blotches(ctx, w, h, '#f0f0f0', 40, 2, 12, 0.3, 6);
    if (kind === 'sand') {
      ctx.strokeStyle = 'rgba(150,150,150,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        const y0 = (i / 18) * h;
        ctx.moveTo(0, y0);
        for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 5);
        ctx.stroke();
      }
    }
  }, { repeat: [1, 1], key: 'terrain-' + kind });
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', key = 'glow') {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { key, aniso: false });
}

export function smokeTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const r = rng(5);
    for (let i = 0; i < 26; i++) {
      const x = w / 2 + (r() - 0.5) * 40, y = h / 2 + (r() - 0.5) * 40, rad = 18 + r() * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }, { key: 'smoke', aniso: false });
}

/** Soft rounded-rectangle shadow for the blob under each car. */
export function blobShadowTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.filter = 'blur(14px)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const pad = 26;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, 26);
    else ctx.rect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.fill();
    ctx.filter = 'none';
  }, { key: 'blob', srgb: false, aniso: false });
}

export function plateTexture(text) {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f7f7f2';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = '#0b6b3a';
    ctx.fillRect(6, 6, 34, h - 12);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PK', 23, 38);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(text, 146, 47);
  }, { key: 'plate-' + text });
}

/** Mesh-style grille insert (dots, honeycomb or slats). */
export function grilleTexture(style = 'honey') {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#060607';
    ctx.fillRect(0, 0, w, h);
    if (style === 'diamond') {
      for (let y = 6; y < h; y += 12)
        for (let x = (y / 12) % 2 ? 12 : 6; x < w; x += 12) {
          ctx.fillStyle = '#d9dde3';
          ctx.beginPath();
          ctx.moveTo(x, y - 3.2);
          ctx.lineTo(x + 3.2, y);
          ctx.lineTo(x, y + 3.2);
          ctx.lineTo(x - 3.2, y);
          ctx.fill();
        }
    } else if (style === 'slats') {
      for (let y = 8; y < h; y += 18) {
        const g = ctx.createLinearGradient(0, y, 0, y + 8);
        g.addColorStop(0, '#3a3c42');
        g.addColorStop(1, '#0d0d10');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, w, 8);
      }
    } else {
      ctx.strokeStyle = '#2a2c31';
      ctx.lineWidth = 2;
      const s = 10;
      for (let y = 0; y < h + s; y += s * 0.87)
        for (let x = ((y / (s * 0.87)) % 2) * s * 0.75; x < w + s; x += s * 1.5) {
          ctx.beginPath();
          for (let a = 0; a < 6; a++) ctx.lineTo(x + Math.cos((a * Math.PI) / 3) * s * 0.5, y + Math.sin((a * Math.PI) / 3) * s * 0.5);
          ctx.closePath();
          ctx.stroke();
        }
    }
  }, { key: 'grille-' + style });
}

export function checkerTexture() {
  return canvasTexture(256, 64, (ctx, w, h) => {
    const s = 32;
    for (let y = 0; y < h; y += s)
      for (let x = 0; x < w; x += s) {
        ctx.fillStyle = ((x + y) / s) % 2 ? '#111' : '#f4f4f4';
        ctx.fillRect(x, y, s, s);
      }
  }, { key: 'checker' });
}

export function chevronTexture(a = '#f2c418', b = '#111111') {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = a;
    for (let x = -64; x < w + 64; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 64, h / 2);
      ctx.lineTo(x + 32, h);
      ctx.lineTo(x, h);
      ctx.lineTo(x + 32, h / 2);
      ctx.fill();
    }
  }, { key: 'chevron-' + a });
}

export function kerbTexture() {
  return canvasTexture(64, 256, (ctx, w, h) => {
    for (let y = 0; y < h; y += 64) {
      ctx.fillStyle = '#d61f26';
      ctx.fillRect(0, y, w, 32);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, y + 32, w, 32);
    }
  }, { key: 'kerb' });
}

/** Text panel (road signs, banners, neon). lines: [{text, size, color, font, dy}] */
export function textTexture(w, h, { bg = '#0b6b3a', border = '#ffffff', borderWidth = 6, lines = [], radius = 10, glow = null, key = null } = {}) {
  return canvasTexture(w, h, (ctx) => {
    if (bg) {
      ctx.fillStyle = bg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, w, h, radius);
      else ctx.rect(0, 0, w, h);
      ctx.fill();
    }
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = borderWidth;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(borderWidth * 1.5, borderWidth * 1.5, w - borderWidth * 3, h - borderWidth * 3, radius * 0.7);
      else ctx.rect(borderWidth * 1.5, borderWidth * 1.5, w - borderWidth * 3, h - borderWidth * 3);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of lines) {
      ctx.font = `${l.weight || 'bold'} ${l.size}px ${l.font || '"Segoe UI", Arial, sans-serif'}`;
      if (glow || l.glow) {
        ctx.shadowColor = l.glow || glow;
        ctx.shadowBlur = l.blur || 18;
      }
      ctx.fillStyle = l.color || '#fff';
      ctx.fillText(l.text, l.x ?? w / 2, l.y);
      ctx.shadowBlur = 0;
    }
  }, { key });
}

/** Lit office/apartment windows for night buildings (also used as emissive map). */
export function windowTexture(seed = 7, night = true) {
  return canvasTexture(256, 512, (ctx, w, h) => {
    const r = rng(seed);
    ctx.fillStyle = night ? '#0d0f18' : '#55606e';
    ctx.fillRect(0, 0, w, h);
    const cols = 8, rows = 24;
    const cw = w / cols, rh = h / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const lit = r();
        let c;
        if (night) c = lit > 0.72 ? (r() > 0.35 ? `hsl(${34 + r() * 14},75%,${42 + r() * 22}%)` : `hsl(${195 + r() * 40},70%,${50 + r() * 18}%)`) : r() > 0.5 ? '#0b0d16' : '#11131f';
        else c = r() > 0.5 ? '#9fb4c8' : '#7d90a4';
        ctx.fillStyle = c;
        ctx.fillRect(x * cw + 4, y * rh + 4, cw - 8, rh - 7);
      }
  }, { key: `win-${seed}-${night}` });
}

/** Pakistani truck-art inspired panel (original pattern: flowers, borders, bright colours). */
export function truckArtTexture(seed = 3) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    const r = rng(seed);
    const pal = ['#e8262b', '#f7c51e', '#1aa34a', '#1f6fd6', '#f26b1d', '#d12c8a', '#14b3c4'];
    ctx.fillStyle = pal[Math.floor(r() * pal.length)];
    ctx.fillRect(0, 0, w, h);
    // borders
    for (let b = 0; b < 4; b++) {
      ctx.strokeStyle = pal[(b * 2 + 1) % pal.length];
      ctx.lineWidth = 10 - b * 2;
      ctx.strokeRect(8 + b * 12, 8 + b * 12, w - 16 - b * 24, h - 16 - b * 24);
    }
    // triangle bunting
    for (let x = 0; x < w; x += 24) {
      ctx.fillStyle = pal[(x / 24) % pal.length | 0];
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 24, 0);
      ctx.lineTo(x + 12, 18);
      ctx.fill();
    }
    // flowers
    for (let i = 0; i < 14; i++) {
      const cx = 70 + r() * (w - 140), cy = 70 + r() * (h - 120), rad = 12 + r() * 18;
      const c1 = pal[Math.floor(r() * pal.length)], c2 = pal[Math.floor(r() * pal.length)];
      for (let p = 0; p < 8; p++) {
        const a = (p / 8) * Math.PI * 2;
        ctx.fillStyle = c1;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, rad * 0.55, rad * 0.3, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ماشاءاللہ', w / 2, h - 34);
  }, { key: 'truckart-' + seed });
}

export function gradientTexture(stops, vertical = true, key = null) {
  return canvasTexture(vertical ? 4 : 256, vertical ? 256 : 4, (ctx, w, h) => {
    const g = vertical ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createLinearGradient(0, 0, w, 0);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { key, aniso: false });
}

/** Floor for the garage showroom: dark polished concrete with a glowing ring. */
export function showroomFloorTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#22252e');
    g.addColorStop(0.6, '#101219');
    g.addColorStop(1, '#06070b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(80,90,120,0.14)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 16; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 16) * w, 0);
      ctx.lineTo((i / 16) * w, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (i / 16) * h);
      ctx.lineTo(w, (i / 16) * h);
      ctx.stroke();
    }
  }, { key: 'showfloor' });
}

export function disposeUnsharedTexture(t) {
  if (t && !t.userData.shared) t.dispose();
}
