// Fixed-timestep simulation with a variable-rate render. Physics always advances in 1/120 s steps,
// so handling feels the same at 30, 60 or 144 FPS.

export class GameLoop {
  constructor({ update, render, step = 1 / 120, maxSteps = 10 }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.maxSteps = maxSteps;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.timeScale = 1;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
  }

  _frame(now) {
    if (!this.running) return;
    requestAnimationFrame(this._frame);
    // Clamp long frames (tab switches, GC pauses) so the car never teleports.
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.acc += dt * this.timeScale;
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) {
      this.update(this.step);
      this.acc -= this.step;
      n++;
    }
    if (n === this.maxSteps) this.acc = 0;
    this.render(dt);
  }
}
