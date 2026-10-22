// Sky dome, sun / moon, fog, hemisphere light, shadow-casting sun that follows the player,
// image-based reflections (PMREM of the sky) and stars / clouds.
import * as THREE from 'three';
import { rng } from './utils.js';

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

const skyFrag = /* glsl */ `
  uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
  uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow; uniform float sunSize;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.4));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * (pow(s, 6.0) * 0.18 * sunGlow + pow(s, 64.0) * 0.5 * sunGlow);
    col += sunColor * smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.6, s) * 3.0;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export class Environment {
  constructor(renderer, scene, env, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.env = env;
    this.quality = quality;
    this.objects = [];
    this.night = !!env.night;

    const sunDir = new THREE.Vector3(...env.sunDir).normalize();
    this.sunDir = sunDir;

    // Sky dome (rendered behind everything, follows the camera)
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        top: { value: new THREE.Color(env.skyTop) },
        horizon: { value: new THREE.Color(env.skyHorizon) },
        bottom: { value: new THREE.Color(env.skyBottom) },
        sunDir: { value: sunDir },
        sunColor: { value: new THREE.Color(env.sunColor) },
        sunGlow: { value: env.sunGlow ?? 1 },
        sunSize: { value: env.night ? 0.0009 : 0.0016 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.add(this.sky);

    scene.fog = new THREE.Fog(env.fog, env.fogNear, env.fogFar);
    scene.background = new THREE.Color(env.skyHorizon);

    this.hemi = new THREE.HemisphereLight(env.hemiSky, env.hemiGround, env.hemiIntensity);
    this.add(this.hemi);

    this.sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity);
    this.sun.position.copy(sunDir).multiplyScalar(120);
    this.add(this.sun);
    this.add(this.sun.target);
    if (quality.shadows > 0) {
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(quality.shadows, quality.shadows);
      const ext = quality.shadows >= 2048 ? 55 : 42;
      s.camera.left = -ext;
      s.camera.right = ext;
      s.camera.top = ext;
      s.camera.bottom = -ext;
      s.camera.near = 1;
      s.camera.far = 400;
      s.bias = -0.0004;
      s.normalBias = 0.04;
      s.camera.updateProjectionMatrix();
    }

    if (env.stars) this._stars();
    if (env.moon) this._moon(sunDir);
    if (env.clouds) this._clouds();

    // Reflections: prefilter a little scene with the sky + bright panels.
    this._buildEnvMap();
  }

  add(o) {
    this.scene.add(o);
    this.objects.push(o);
    return o;
  }

  _stars() {
    const r = rng(42);
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const y = Math.abs(u) * 0.9 + 0.08;
      const rr = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * rr * 2800;
      pos[i * 3 + 1] = y * 2800;
      pos[i * 3 + 2] = Math.sin(a) * rr * 2800;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 });
    this.stars = new THREE.Points(g, m);
    this.stars.frustumCulled = false;
    this.add(this.stars);
  }

  _moon(dir) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(60, 20, 12), new THREE.MeshBasicMaterial({ color: '#f4f1ff', fog: false }));
    m.position.copy(dir).multiplyScalar(2600);
    this.moon = m;
    this.add(m);
  }

  _clouds() {
    const r = rng(7);
    const tex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      for (let i = 0; i < 16; i++) {
        const x = 30 + r() * 68, y = 50 + r() * 30, rad = 14 + r() * 26;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
    this.clouds = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(mat);
      const a = r() * Math.PI * 2, d = 900 + r() * 1500;
      s.position.set(Math.cos(a) * d, 260 + r() * 260, Math.sin(a) * d);
      const sc = 400 + r() * 500;
      s.scale.set(sc, sc * 0.45, 1);
      this.clouds.add(s);
    }
    this.add(this.clouds);
  }

  _buildEnvMap() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.sky.material.clone());
    sky.material.depthTest = false;
    envScene.add(sky);
    // Bright panels give paint and glass crisp highlights.
    const env = this.env;
    const panel = (color, intensity, pos, size) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    };
    if (env.night) {
      panel('#ff2bd6', 2.5, new THREE.Vector3(30, 6, 10), [14, 4]);
      panel('#22e6ff', 2.5, new THREE.Vector3(-30, 8, -12), [14, 4]);
      panel('#ffd9a8', 2, new THREE.Vector3(0, 30, 0), [20, 6]);
      panel('#8a5cff', 1.8, new THREE.Vector3(10, 5, -30), [20, 6]);
    } else {
      panel('#ffffff', 2.2, this.sunDir.clone().multiplyScalar(40), [12, 12]);
      panel(env.hemiGround, 0.9, new THREE.Vector3(0, -30, 0), [120, 120]);
    }
    const rt = pmrem.fromScene(envScene, 0.02);
    this.envMap = rt.texture;
    this.scene.environment = this.envMap;
    this._envRT = rt;
    envScene.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    pmrem.dispose();
  }

  /** Keep the sky centred on the camera and the shadow frustum on the player. */
  update(camera, focus) {
    this.sky.position.copy(camera.position);
    if (this.stars) this.stars.position.copy(camera.position);
    if (this.moon) this.moon.position.copy(this.sunDir).multiplyScalar(2600).add(camera.position);
    if (this.clouds) this.clouds.position.set(camera.position.x, 0, camera.position.z);
    if (focus) {
      this.sun.target.position.copy(focus);
      this.sun.position.copy(this.sunDir).multiplyScalar(150).add(focus);
      this.sun.target.updateMatrixWorld();
    }
  }

  dispose() {
    for (const o of this.objects) {
      this.scene.remove(o);
      o.traverse?.((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
      });
    }
    if (this.sun.shadow && this.sun.shadow.map) this.sun.shadow.map.dispose();
    if (this._envRT) this._envRT.dispose();
    this.scene.environment = null;
    this.scene.fog = null;
  }
}
