// Keyboard + touch + gamepad input, merged into one driving state.
// Every held control is released when the window loses focus, so cars never get "stuck" accelerating.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'nitro', ShiftRight: 'nitro',
};

const ACTION_KEYS = {
  KeyC: 'camera',
  KeyR: 'reset',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'mute',
};

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.touch = { up: false, down: false, left: false, right: false, handbrake: false, nitro: false };
    this.handlers = {};
    this.capture = false; // when true, arrow keys / space don't scroll the page
    this.lastDevice = 'keyboard';
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this._padPrev = [];

    window.addEventListener('keydown', (e) => this._keyDown(e), { passive: false });
    window.addEventListener('keyup', (e) => this._keyUp(e));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  on(action, fn) {
    (this.handlers[action] ||= []).push(fn);
  }

  emit(action) {
    for (const fn of this.handlers[action] || []) fn();
  }

  _isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') && t.type !== 'range';
  }

  _keyDown(e) {
    if (this._isTyping(e)) return;
    const k = KEYMAP[e.code];
    if (k) {
      this.keys.add(k);
      this.lastDevice = 'keyboard';
      if (this.capture) e.preventDefault();
    }
    const a = ACTION_KEYS[e.code];
    if (a && !e.repeat) {
      if (this.capture) e.preventDefault();
      this.emit(a);
    }
  }

  _keyUp(e) {
    const k = KEYMAP[e.code];
    if (k) this.keys.delete(k);
  }

  releaseAll() {
    this.keys.clear();
    for (const k in this.touch) this.touch[k] = false;
  }

  /** Wire an on-screen button. Uses pointer capture so sliding a finger off doesn't leave it held. */
  bindTouch(el, control) {
    const down = (e) => {
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
      this.touch[control] = true;
      this.lastDevice = 'touch';
      el.classList.add('held');
    };
    const up = () => {
      this.touch[control] = false;
      el.classList.remove('held');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindTouchAction(el, action) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.emit(action);
    });
  }

  _pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const btn = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const pressed = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      let ax = p.axes[0] || 0;
      if (Math.abs(ax) < 0.12) ax = 0;
      const pad = {
        throttle: Math.max(btn(7), pressed(0) ? 1 : 0),
        brake: Math.max(btn(6), pressed(2) ? 1 : 0),
        steer: ax || (pressed(15) ? 1 : 0) - (pressed(14) ? 1 : 0),
        handbrake: pressed(1),
        nitro: pressed(5) || pressed(4),
      };
      // Edge-triggered actions
      const edges = [[3, 'camera'], [9, 'pause'], [8, 'reset']];
      for (const [i, a] of edges) {
        const now = pressed(i);
        if (now && !this._padPrev[i]) this.emit(a);
        this._padPrev[i] = now;
      }
      if (pad.throttle || pad.brake || pad.steer || pad.handbrake || pad.nitro) this.lastDevice = 'gamepad';
      return pad;
    }
    return null;
  }

  /** Merged driving input for this frame. Steering is raw (-1..1); the physics smooths it. */
  read() {
    const k = this.keys, t = this.touch, s = this.state;
    const pad = this._pollGamepad();
    const up = k.has('up') || t.up, down = k.has('down') || t.down;
    const left = k.has('left') || t.left, right = k.has('right') || t.right;
    s.throttle = up ? 1 : 0;
    s.brake = down ? 1 : 0;
    s.steer = (right ? 1 : 0) - (left ? 1 : 0);
    s.handbrake = k.has('handbrake') || t.handbrake;
    s.nitro = k.has('nitro') || t.nitro;
    if (pad) {
      s.throttle = Math.max(s.throttle, pad.throttle);
      s.brake = Math.max(s.brake, pad.brake);
      if (pad.steer) s.steer = Math.max(-1, Math.min(1, pad.steer));
      s.handbrake = s.handbrake || pad.handbrake;
      s.nitro = s.nitro || pad.nitro;
    }
    return s;
  }
}
