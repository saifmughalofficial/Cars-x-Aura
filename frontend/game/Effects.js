// Pooled visual effects: tyre smoke / dust (one Points draw call), sparks (additive Points),
// skid marks (ring-buffer ribbon) and a 2D speed-lines overlay. Nothing is allocated per frame.
import * as THREE from 'three';
import { smokeTexture, glowTexture } from './textures.js';

const vert = /* glsl */ `
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha; varying vec3 vColor;
  void main() {
    vAlpha = aAlpha; vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * uScale / max(-mv.z, 0.5), 512.0);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  uniform sampler2D map;
  varying float vAlpha; varying vec3 vColor;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
    if (gl_FragColor.a < 0.004) discard;
    #include <colorspace_fragment>
  }`;

class ParticlePool {
  constructor(max, map, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aSize', this.sizeAttr);
    g.setAttribute('aAlpha', this.alphaAttr);
    g.setAttribute('aColor', this.colAttr);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { map: { value: map }, uScale: { value: 500 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.active = 0;
  }

  emit(x, y, z, vx, vy, vz, size, grow, life, r, gg, b, alpha, drag = 1.5, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = gg; this.col[i * 3 + 2] = b;
    this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.a0[i] = alpha;
    this.alpha[i] = alpha;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = this.a0[i] * t * (t > 0.85 ? (1 - t) / 0.15 : 1);
    }
    this.active = alive;
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.alphaAttr.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

class SkidMarks {
  constructor(max) {
    this.max = max;
    this.pos = new Float32Array(max * 6 * 3);
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x0b0b0c, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.cursor = 0;
    this.count = 0;
    this.last = new Map();
  }

  /** key identifies a wheel; returns nothing. Pass active=false to break the trail. */
  add(key, x, y, z, rx, rz, active, width = 0.24) {
    const prev = this.last.get(key);
    if (!active) {
      if (prev) prev.on = false;
      return;
    }
    if (!prev || !prev.on) {
      this.last.set(key, { x, y, z, rx, rz, on: true });
      return;
    }
    const dx = x - prev.x, dz = z - prev.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.25) return;
    if (d2 > 25) {
      prev.x = x; prev.y = y; prev.z = z;
      return;
    }
    const w = width / 2;
    const i = this.cursor * 18;
    const p = this.pos;
    const ax = prev.x + prev.rx * w, az = prev.z + prev.rz * w, bx = prev.x - prev.rx * w, bz = prev.z - prev.rz * w;
    const cx = x + rx * w, cz = z + rz * w, ex = x - rx * w, ez = z - rz * w;
    const ya = prev.y + 0.035, yb = y + 0.035;
    p.set([ax, ya, az, bx, ya, bz, cx, yb, cz, bx, ya, bz, ex, yb, ez, cx, yb, cz], i);
    this.cursor = (this.cursor + 1) % this.max;
    this.count = Math.min(this.max, this.count + 1);
    this.mesh.geometry.setDrawRange(0, this.count * 6);
    this.attr.needsUpdate = true;
    prev.x = x; prev.y = y; prev.z = z; prev.rx = rx; prev.rz = rz;
  }

  clear() {
    this.count = 0;
    this.cursor = 0;
    this.last.clear();
    this.mesh.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/** Radial speed lines drawn on a 2D canvas over the 3D view. */
export class SpeedLines {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = [];
    for (let i = 0; i < 70; i++) this.lines.push({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.5 + Math.random() });
    this.level = 0;
    this.drawn = false;
  }

  resize(w, h) {
    this.canvas.width = Math.round(w * 0.5);
    this.canvas.height = Math.round(h * 0.5);
  }

  draw(dt, intensity, nitro) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    this.level += (intensity - this.level) * Math.min(1, dt * 4);
    if (this.level < 0.03) {
      if (this.drawn) {
        c.clearRect(0, 0, W, H);
        this.drawn = false;
      }
      return;
    }
    this.drawn = true;
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.46, R = Math.hypot(W, H) * 0.55;
    c.lineCap = 'round';
    for (const l of this.lines) {
      l.r += dt * (1.6 + this.level * 3) * l.s;
      if (l.r > 1) {
        l.r = 0.3 + Math.random() * 0.2;
        l.a = Math.random() * Math.PI * 2;
      }
      const r0 = R * l.r, r1 = r0 + R * (0.05 + 0.12 * this.level) * l.s;
      const alpha = Math.min(1, (l.r - 0.3) * 2) * this.level * 0.42;
      c.strokeStyle = nitro ? `rgba(140,220,255,${alpha})` : `rgba(255,255,255,${alpha * 0.8})`;
      c.lineWidth = nitro ? 2.2 : 1.4;
      c.beginPath();
      c.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0 * 0.7);
      c.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1 * 0.7);
      c.stroke();
    }
  }
}

const _v = [new THREE.Vector3(), new THREE.Vector3()];
const _e = new THREE.Vector3();

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.smoke = new ParticlePool(quality.particles, smokeTexture(), false);
    this.sparks = new ParticlePool(Math.max(80, Math.round(quality.particles / 3)), glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 'spark'), true);
    this.skids = new SkidMarks(quality.skidMarks);
    scene.add(this.smoke.points, this.sparks.points, this.skids.mesh);
    this.dustColor = [0.85, 0.7, 0.5];
    this.ambientDust = false;
    this.acc = 0;
  }

  setTrackStyle(env, shoulderKind) {
    this.ambientDust = !!env.dust;
    this.dustColor = shoulderKind === 'sand' ? [0.86, 0.66, 0.45] : shoulderKind === 'grass' ? [0.55, 0.5, 0.38] : [0.62, 0.6, 0.58];
    this.night = !!env.night;
  }

  setViewport(height, fov) {
    const s = height / (2 * Math.tan((fov * Math.PI) / 360));
    this.smoke.mat.uniforms.uScale.value = s;
    this.sparks.mat.uniforms.uScale.value = s;
  }

  /** Emit wheel effects for one car (called every render frame). */
  carEffects(car, dt, near) {
    const p = car.phys;
    if (!p || car.ghost) return;
    const contacts = car.rearContacts(_v);
    const rx = -Math.cos(p.h), rz = Math.sin(p.h);
    const skidOn = p.grounded && p.slip > 0.35 && p.surface === 'road';
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      this.skids.add(car.root.id * 4 + i, c.x, c.y, c.z, rx, rz, skidOn && near);
    }
    if (!near) return;
    const budget = this.quality.particles;
    // tyre smoke
    if (p.slip > 0.3 && p.grounded) {
      const rate = (p.slip - 0.25) * (budget > 300 ? 60 : 30) * dt;
      for (let i = 0; i < contacts.length; i++) {
        let n = rate + Math.random();
        while (n-- >= 1) {
          const c = contacts[i];
          const sh = this.night ? 0.55 : 0.92;
          this.smoke.emit(
            c.x + (Math.random() - 0.5) * 0.4, c.y + 0.25, c.z + (Math.random() - 0.5) * 0.4,
            p.vx * 0.25 + (Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 1.2, p.vz * 0.25 + (Math.random() - 0.5) * 1.5,
            1.2, 3.2, 1.3 + Math.random() * 1.2, sh, sh, sh * 1.02, 0.42, 1.2, -0.25,
          );
        }
      }
    }
    // dust off-road
    if (p.surface !== 'road' && p.grounded && p.speed > 6) {
      let n = Math.min(4, p.speed * 0.08) * (budget > 300 ? 1 : 0.5) + Math.random();
      while (n-- >= 1) {
        const c = contacts[Math.floor(Math.random() * contacts.length)];
        const [r, g, b] = this.dustColor;
        this.smoke.emit(c.x, c.y + 0.3, c.z, p.vx * 0.15 + (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, p.vz * 0.15 + (Math.random() - 0.5) * 2, 1.6, 3.5, 1.6, r, g, b, 0.5, 1.4, -0.1);
      }
    }
    // landing puff
    if (p.landImpact > 4) {
      for (let k = 0; k < 18; k++) {
        const a = Math.random() * Math.PI * 2;
        const [r, g, b] = this.dustColor;
        this.smoke.emit(p.x + Math.cos(a) * 1.5, p.y + 0.2, p.z + Math.sin(a) * 1.5, Math.cos(a) * 5, 0.8, Math.sin(a) * 5, 1.5, 4, 1.2, r, g, b, 0.5, 2.5, 0);
      }
    }
    // nitro / exhaust glow particles
    if (p.nitroActive && Math.random() < 0.6) {
      for (const a of car.model.anchors.exhaust) {
        car.toWorld(a, _e);
        this.sparks.emit(_e.x, _e.y, _e.z, -Math.sin(p.h) * 6 + p.vx * 0.6, 0.4, -Math.cos(p.h) * 6 + p.vz * 0.6, 0.35, -0.3, 0.25, 0.4, 0.8, 1.6, 0.9, 3, 0);
      }
    }
  }

  /** Sparks at a world point (wall scrape / car contact). */
  sparkBurst(x, y, z, vx, vz, strength) {
    const n = Math.min(24, Math.round(strength * 2.5));
    for (let i = 0; i < n; i++) {
      this.sparks.emit(
        x, y + 0.4, z,
        vx * 0.4 + (Math.random() - 0.5) * 8, 1 + Math.random() * 4, vz * 0.4 + (Math.random() - 0.5) * 8,
        0.22 + Math.random() * 0.12, -0.1, 0.35 + Math.random() * 0.35, 1.6, 0.9, 0.35, 1, 1.2, 14,
      );
    }
  }

  /** Floating dust in the air around the camera (desert). */
  ambient(dt, camera) {
    if (!this.ambientDust) return;
    this.acc += dt * 14;
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 40;
      const [r, g, b] = this.dustColor;
      this.smoke.emit(camera.position.x + Math.cos(a) * d, camera.position.y - 1 + Math.random() * 4, camera.position.z + Math.sin(a) * d,
        6 + Math.random() * 3, 0.2, 2 * Math.random(), 2.5, 2, 3, r, g, b, 0.16, 0.2, 0);
    }
  }

  update(dt) {
    this.smoke.update(dt);
    this.sparks.update(dt);
  }

  clear() {
    this.smoke.clear();
    this.sparks.clear();
    this.skids.clear();
  }

  dispose() {
    this.scene.remove(this.smoke.points, this.sparks.points, this.skids.mesh);
    this.smoke.dispose();
    this.sparks.dispose();
    this.skids.dispose();
  }
}
