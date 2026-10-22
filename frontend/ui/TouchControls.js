// On-screen controls for phones and tablets. Large multi-touch buttons with pointer capture.
import { el } from './dom.js';

export class TouchControls {
  constructor(root, input) {
    this.root = root;
    root.innerHTML = '';
    const ui = el(`
      <div class="touch-ui">
        <div class="t-left">
          <button class="tbtn steer" data-c="left" aria-label="Steer left">◀</button>
          <button class="tbtn steer" data-c="right" aria-label="Steer right">▶</button>
        </div>
        <div class="t-right">
          <button class="tbtn small" data-c="nitro" aria-label="Nitro">N2O</button>
          <button class="tbtn small" data-c="handbrake" aria-label="Handbrake / drift">DRIFT</button>
          <button class="tbtn brake" data-c="down" aria-label="Brake / reverse">BRAKE</button>
          <button class="tbtn gas" data-c="up" aria-label="Accelerate">GAS</button>
        </div>
        <div class="t-top">
          <button class="tbtn tiny" data-a="camera" aria-label="Camera">🎥</button>
          <button class="tbtn tiny" data-a="reset" aria-label="Reset car">↺</button>
          <button class="tbtn tiny" data-a="pause" aria-label="Pause">❚❚</button>
        </div>
      </div>`);
    root.appendChild(ui);
    ui.querySelectorAll('[data-c]').forEach((b) => input.bindTouch(b, b.dataset.c));
    ui.querySelectorAll('[data-a]').forEach((b) => input.bindTouchAction(b, b.dataset.a));
    // stop the page from scrolling / zooming while playing
    root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
    document.body.classList.toggle('touch', on);
  }
}
