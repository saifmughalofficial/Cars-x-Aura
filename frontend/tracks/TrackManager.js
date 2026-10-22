// Registry of playable tracks. To add a track: create a definition module (see PakistanHighway.js)
// and append it to TRACKS — the menus, minimap, AI and race logic pick it up automatically.
import { Track } from './TrackBuilder.js';
import PakistanHighway from './PakistanHighway.js';
import DesertStorm from './DesertStorm.js';
import NeonCity from './NeonCity.js';

export const TRACKS = [PakistanHighway, DesertStorm, NeonCity];

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}

export class TrackManager {
  constructor(scene) {
    this.scene = scene;
    this.current = null;
  }

  async load(id, quality, onProgress) {
    this.unload();
    const def = getTrackDef(id);
    const track = await Track.build(def, quality, onProgress);
    this.scene.add(track.group);
    this.current = track;
    return track;
  }

  unload() {
    if (this.current) {
      this.current.dispose();
      this.current = null;
    }
  }
}

/** Polyline of a track for menus / minimap previews, without building any meshes. */
export function previewPath(def, count = 160) {
  const pts = def.points;
  const out = [];
  const n = pts.length;
  // centripetal Catmull-Rom approximation (uniform is fine for a thumbnail)
  for (let i = 0; i < count; i++) {
    const f = (i / count) * n;
    const k = Math.floor(f), t = f - k;
    const p0 = pts[(k - 1 + n) % n], p1 = pts[k % n], p2 = pts[(k + 1) % n], p3 = pts[(k + 2) % n];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}
