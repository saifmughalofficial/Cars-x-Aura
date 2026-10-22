// Entry point: wait for the local fonts (they are drawn into canvas textures), then boot the game.
import { Game } from './game/Game.js';

const msg = document.querySelector('#loading .l-msg');
const fill = document.querySelector('#loading .l-fill');
const setProgress = (p, text) => {
  if (fill) fill.style.width = `${Math.round(p * 100)}%`;
  if (msg && text) msg.textContent = text;
};

async function boot() {
  setProgress(0.2, 'Loading fonts…');
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('800 40px Orbitron'),
        document.fonts.load('700 20px Rajdhani'),
        document.fonts.load('500 20px Rajdhani'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) {
    /* fonts are optional */
  }
  setProgress(0.5, 'Starting the engine…');
  await new Promise((r) => requestAnimationFrame(r));
  const game = new Game({
    canvas: document.getElementById('game-canvas'),
    fxCanvas: document.getElementById('fx-canvas'),
    hud: document.getElementById('hud'),
    touch: document.getElementById('touch'),
    screens: document.getElementById('screens'),
    toast: document.getElementById('toast'),
  });
  setProgress(1, 'Ready');
  game.start();
  window.__booted = true;
  const l = document.getElementById('loading');
  l.classList.add('done');
  setTimeout(() => l.remove(), 700);
}

boot().catch((err) => {
  console.error(err);
  window.__bootFailed = true;
  if (msg) {
    msg.innerHTML = `Cars x Aura could not start: <b>${String(err && err.message ? err.message : err).replace(/</g, '&lt;')}</b><br>` +
      'Make sure hardware acceleration is enabled and your browser is up to date, then reload.' +
      '<br><button onclick="location.reload()">Reload</button>';
  }
});
