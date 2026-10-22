// The garage / main-menu backdrop: a dark studio with a glowing turntable, soft-box reflections,
// coloured rim lights and the selected car slowly rotating.
import * as THREE from 'three';
import { Vehicle } from '../vehicles/Vehicle.js';
import { showroomFloorTexture } from '../game/textures.js';
import { damp, clamp } from '../game/utils.js';

const _size = new THREE.Vector2();

export class Showroom {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#05060b');
    scene.fog = new THREE.Fog('#05060b', 18, 46);
    this.camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
    this.yaw = 0.7;
    this.pitch = 0.16;
    this.dist = 11;
    this.auto = true;
    this.autoT = 0;
    this.view = 'menu';
    this.offset = 0;
    this.targetOffset = 0.2;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64),
      new THREE.MeshStandardMaterial({ map: showroomFloorTexture(), roughness: 0.28, metalness: 0.55, envMapIntensity: 0.6 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.7, 0.12, 64),
      new THREE.MeshStandardMaterial({ color: '#0d0f16', metalness: 0.7, roughness: 0.25 }),
    );
    table.position.y = 0.06;
    table.receiveShadow = true;
    scene.add(table);
    this.table = table;
    const ring = (r, color, y, tube = 0.035) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 96), new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: 2.4 }));
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      scene.add(m);
      return m;
    };
    this.ring1 = ring(3.66, '#22e6ff', 0.1);
    this.ring2 = ring(4.4, '#a855ff', 0.012, 0.02);

    // curved back wall with light strips
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(22, 22, 14, 64, 1, true, Math.PI * 0.15, Math.PI * 1.7),
      new THREE.MeshStandardMaterial({ color: '#0a0b12', roughness: 0.9, side: THREE.BackSide }),
    );
    wall.position.y = 7;
    scene.add(wall);
    for (let i = 0; i < 3; i++) {
      const strip = new THREE.Mesh(
        new THREE.CylinderGeometry(21.8, 21.8, 0.08, 64, 1, true, Math.PI * 0.15, Math.PI * 1.7),
        new THREE.MeshBasicMaterial({ color: i === 1 ? '#a855ff' : '#22e6ff', side: THREE.BackSide, fog: false }),
      );
      strip.position.y = 1.2 + i * 2.2;
      strip.material.color.multiplyScalar(i === 1 ? 0.9 : 0.6);
      scene.add(strip);
    }

    scene.add(new THREE.HemisphereLight('#8aa0ff', '#0a0a10', 0.55));
    const key = new THREE.SpotLight('#ffffff', 900, 40, 0.55, 0.6, 1.6);
    key.position.set(4, 10, 6);
    key.target.position.set(0, 0.6, 0);
    if (quality.shadows > 0) {
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.0005;
    }
    scene.add(key, key.target);
    const rimA = new THREE.PointLight('#22e6ff', 70, 18, 1.6);
    rimA.position.set(-6, 3, -5);
    const rimB = new THREE.PointLight('#ff2bd6', 55, 18, 1.6);
    rimB.position.set(6, 2.5, -4);
    const fill = new THREE.DirectionalLight('#c8d4ff', 0.7);
    fill.position.set(-4, 5, 8);
    scene.add(rimA, rimB, fill);

    this._env();
    this.car = null;
    this.carT = 1;
  }

  _env() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene();
    s.background = new THREE.Color('#05060a');
    const box = (color, k, pos, size) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      s.add(m);
    };
    box('#ffffff', 3, new THREE.Vector3(0, 12, 0), [16, 5]);
    box('#ffffff', 2, new THREE.Vector3(10, 6, 6), [6, 10]);
    box('#ffffff', 1.6, new THREE.Vector3(-10, 6, 4), [6, 10]);
    box('#22e6ff', 2, new THREE.Vector3(-12, 2, -8), [10, 2]);
    box('#ff2bd6', 2, new THREE.Vector3(12, 2, -8), [10, 2]);
    const rt = pmrem.fromScene(s, 0.03);
    this.scene.environment = rt.texture;
    s.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    pmrem.dispose();
  }

  setCar(cfg, paint) {
    if (this.car && this.car.cfg.id === cfg.id) {
      this.car.setPaint(paint.color, paint.finish);
      return this.car;
    }
    if (this.car) this.car.dispose();
    this.car = new Vehicle(cfg, { paint, quality: this.quality, isPlayer: true });
    this.car.root.position.y = 0.12;
    this.car.root.traverse((o) => {
      if (o.isMesh && o.castShadow) o.castShadow = this.quality.shadows > 0;
    });
    this.scene.add(this.car.root);
    this.carT = 0;
    // frame the car by its length
    this.dist = 7.2 + cfg.dims.L * 0.95;
    return this.car;
  }

  setPaint(color, finish) {
    if (this.car) this.car.setPaint(color, finish);
  }

  setView(view) {
    this.view = view;
    this.targetOffset = view === 'menu' ? 0.2 : view === 'garage' ? 0.02 : 0;
    this.zoom = view === 'garage' ? 1.18 : 1;
  }

  drag(dx, dy) {
    this.yaw -= dx * 0.008;
    this.pitch = clamp(this.pitch + dy * 0.004, 0.02, 0.6);
    this.auto = false;
    this.autoT = 3;
  }

  update(dt) {
    if (!this.auto) {
      this.autoT -= dt;
      if (this.autoT <= 0) this.auto = true;
    } else this.yaw += dt * 0.18;
    this.carT = Math.min(1, this.carT + dt * 2.2);
    if (this.car) {
      const k = 1 - Math.pow(1 - this.carT, 3);
      this.car.root.position.y = 0.12 + (1 - k) * 0.6;
      this.car.root.rotation.y = (1 - k) * -0.6;
      this.car.model.blob.material.opacity = 0.7 * k;
    }
    this.ring1.material.emissiveIntensity = 2 + Math.sin(performance.now() * 0.002) * 0.6;
    this.offset = damp(this.offset, this.targetOffset, 4, dt);
    const c = this.camera;
    this.zoomCur = damp(this.zoomCur || 1, this.zoom || 1, 4, dt);
    const dist = this.dist * this.zoomCur;
    c.position.set(Math.sin(this.yaw) * dist * Math.cos(this.pitch), 0.9 + Math.sin(this.pitch) * dist, Math.cos(this.yaw) * dist * Math.cos(this.pitch));
    c.lookAt(0, 0.75, 0);
  }

  resize(w, h) {
    const c = this.camera;
    c.aspect = w / h;
    // shift the projection so the car sits to the right of the menu panel
    const narrow = w < 760;
    const off = narrow ? 0 : this.offset;
    c.setViewOffset(w, h, -w * off, narrow ? h * 0.12 : 0, w, h);
    c.updateProjectionMatrix();
  }

  render(renderer) {
    const size = renderer.getSize(_size);
    this.resize(size.x, size.y);
    renderer.render(this.scene, this.camera);
  }
}
