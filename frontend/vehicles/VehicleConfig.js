// Vehicle catalogue. Every model is an ORIGINAL procedural design built in VehicleFactory.js.
// Real-world names appear only in the "inspiredBy" line, to describe the body style the model is
// based on. No manufacturer logos or proprietary assets are used, and Cars x Aura is not
// affiliated with or endorsed by any manufacturer.
//
// dims: L length, W width, H height, wb wheelbase, r wheel radius, gc ground clearance (body sill),
//       belt beltline, hood nose-top height, deck rear-deck height (all metres).
// cabin: z fractions of length (-0.5 rear .. +0.5 front) for windshield base (ws), roof front (rf),
//        roof rear (rr) and rear-glass base (re).
// perf: top km/h, 0-100 seconds, lat = cornering grip (m/s^2), brake (m/s^2), mass kg, gears.

const C = {
  white: '#eef1f4', pearl: '#f4f2ea', black: '#0d0e12', silver: '#b9bec6', grey: '#5b6068',
  green: '#0f6b4c', blue: '#1d4fbf', red: '#b3121c', yellow: '#f2c418', orange: '#ff6a13',
  purple: '#5c2bd6', teal: '#11a5a8', bronze: '#8a5a2b', navy: '#18233f', lime: '#7ed321',
};

export const PAINT_SWATCHES = [
  '#eef1f4', '#0d0e12', '#b9bec6', '#5b6068', '#b3121c', '#ff6a13', '#f2c418', '#7ed321',
  '#0f6b4c', '#11a5a8', '#1d4fbf', '#18233f', '#5c2bd6', '#c21f8a', '#8a5a2b', '#3a2a1a',
];

export const FINISHES = {
  gloss: { label: 'Gloss', metalness: 0.12, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 },
  metallic: { label: 'Metallic', metalness: 0.72, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 },
  matte: { label: 'Matte', metalness: 0.25, roughness: 0.72, clearcoat: 0, clearcoatRoughness: 0.5 },
  pearl: { label: 'Pearl', metalness: 0.45, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 0.65 },
};

const car = (o) => ({
  grille: 'honda', lights: 'slim', tails: 'pair', rims: 'y5', rimColor: '#c9ccd2', caliper: '#3a3d44',
  exhaust: 'dual', spoiler: null, roof: 'body', rails: false, cladding: false, sunroof: false,
  seat: '#26282e', engine: 'i4', offroad: 1, plate: 'CXA', ...o,
});

export const VEHICLES = [
  // ───────────── Toyota-inspired ─────────────
  car({
    id: 'cruiser-300', name: 'Cruiser 300', brand: 'Toyota', inspiredBy: 'Toyota Land Cruiser 300',
    category: 'Full-size SUV', type: 'suv', engine: 'v6tt',
    paint: { color: C.pearl, finish: 'pearl' },
    dims: { L: 4.98, W: 1.98, H: 1.93, wb: 2.85, r: 0.4, gc: 0.36, belt: 1.24, hood: 1.12, deck: 1.22 },
    cabin: { ws: 0.17, rf: 0.04, rr: -0.44, re: -0.485 }, n: 5.5, tumble: 0.9,
    grille: 'toyotaBig', lights: 'toyotaSuv', rims: 'multi', rails: true, cladding: true, offroad: 1.3,
    perf: { top: 210, accel: 6.7, lat: 12.5, brake: 9.2, mass: 2600, gears: 10 },
  }),
  car({
    id: 'prado-250', name: 'Prado Trail', brand: 'Toyota', inspiredBy: 'Toyota Land Cruiser Prado',
    category: 'Mid-size SUV', type: 'suv', engine: 'diesel',
    paint: { color: '#6d6a5e', finish: 'metallic' },
    dims: { L: 4.92, W: 1.98, H: 1.87, wb: 2.85, r: 0.4, gc: 0.38, belt: 1.22, hood: 1.15, deck: 1.2 },
    cabin: { ws: 0.16, rf: 0.06, rr: -0.45, re: -0.49 }, n: 7, tumble: 0.94,
    grille: 'toyotaBar', lights: 'boxy', rims: 'offroad', rimColor: '#2b2d31', rails: true, cladding: true,
    offroad: 1.35, perf: { top: 180, accel: 9.4, lat: 12, brake: 9, mass: 2400, gears: 8 },
  }),
  car({
    id: 'fortuner-legend', name: 'Fortuner Legend', brand: 'Toyota', inspiredBy: 'Toyota Fortuner Legender',
    category: 'SUV', type: 'suv', engine: 'diesel',
    paint: { color: C.black, finish: 'gloss' },
    dims: { L: 4.8, W: 1.86, H: 1.84, wb: 2.75, r: 0.39, gc: 0.36, belt: 1.2, hood: 1.08, deck: 1.18 },
    cabin: { ws: 0.15, rf: 0.04, rr: -0.42, re: -0.48 }, n: 5, tumble: 0.88,
    grille: 'toyotaSplit', lights: 'toyotaSuv', rims: 'y5', rimColor: '#9aa0a8', cladding: true, offroad: 1.3,
    perf: { top: 185, accel: 9.8, lat: 12, brake: 9, mass: 2300, gears: 6 },
  }),
  car({
    id: 'hilux-revo', name: 'Hilux Revo GR', brand: 'Toyota', inspiredBy: 'Toyota Hilux Revo (double cab)',
    category: 'Pickup', type: 'pickup', engine: 'diesel',
    paint: { color: C.black, finish: 'gloss' },
    dims: { L: 5.33, W: 1.86, H: 1.82, wb: 3.085, r: 0.39, gc: 0.4, belt: 1.24, hood: 1.15, deck: 1.24 },
    cabin: { ws: 0.2, rf: 0.11, rr: -0.12, re: -0.15, bed: -0.16 }, n: 5.5, tumble: 0.88,
    grille: 'toyotaBig', lights: 'toyotaSuv', rims: 'offroad', rimColor: '#1c1d20', cladding: true,
    sportsBar: true, offroad: 1.4, perf: { top: 180, accel: 10.2, lat: 11.2, brake: 8.8, mass: 2200, gears: 6 },
  }),
  car({
    id: 'hilux-dala', name: 'Revo Dala', brand: 'Toyota', inspiredBy: 'Toyota Hilux single-cab pickup ("Dala")',
    category: 'Work pickup', type: 'pickup', engine: 'diesel',
    paint: { color: C.white, finish: 'gloss' },
    dims: { L: 5.33, W: 1.8, H: 1.8, wb: 3.085, r: 0.37, gc: 0.4, belt: 1.2, hood: 1.12, deck: 1.2 },
    cabin: { ws: 0.2, rf: 0.12, rr: 0.05, re: 0.03, bed: 0.02 }, n: 6, tumble: 0.9,
    grille: 'toyotaBar', lights: 'boxy', rims: 'steel', rimColor: '#d8dadc', offroad: 1.35, plate: 'DLA',
    perf: { top: 160, accel: 13, lat: 10.8, brake: 8.5, mass: 1900, gears: 5 },
  }),
  car({
    id: 'corolla-x', name: 'Corolla X', brand: 'Toyota', inspiredBy: 'Toyota Corolla sedan',
    category: 'Compact sedan', type: 'sedan', engine: 'i4',
    paint: { color: C.silver, finish: 'metallic' },
    dims: { L: 4.63, W: 1.78, H: 1.44, wb: 2.7, r: 0.32, gc: 0.2, belt: 0.98, hood: 0.86, deck: 1.0 },
    cabin: { ws: 0.2, rf: 0.08, rr: -0.17, re: -0.3 }, n: 3.6, tumble: 0.78,
    grille: 'toyotaSedan', lights: 'slim', rims: 'y5', offroad: 0.9,
    perf: { top: 195, accel: 9.6, lat: 14, brake: 10.2, mass: 1350, gears: 6 },
  }),
  car({
    id: 'supra-mk5', name: 'Supreme MK5', brand: 'Toyota', inspiredBy: 'Toyota GR Supra',
    category: 'Sports coupe', type: 'sports', engine: 'i6',
    paint: { color: C.red, finish: 'gloss' },
    dims: { L: 4.38, W: 1.85, H: 1.29, wb: 2.47, r: 0.345, gc: 0.16, belt: 0.88, hood: 0.72, deck: 0.92 },
    cabin: { ws: 0.1, rf: -0.02, rr: -0.12, re: -0.33 }, n: 3, tumble: 0.7,
    grille: 'sport', lights: 'sharp', tails: 'duck', rims: 'twin5', rimColor: '#2a2c30', caliper: '#c41e1e',
    spoiler: 'duck', offroad: 0.8, perf: { top: 255, accel: 4.1, lat: 17, brake: 11.8, mass: 1500, gears: 8 },
  }),

  // ───────────── BMW-inspired ─────────────
  car({
    id: 'm4-aura', name: 'M-Four Coupe', brand: 'BMW', inspiredBy: 'BMW M4 coupe',
    category: 'Performance coupe', type: 'coupe', engine: 'i6',
    paint: { color: '#4f8d2e', finish: 'metallic' },
    dims: { L: 4.79, W: 1.89, H: 1.39, wb: 2.86, r: 0.355, gc: 0.17, belt: 0.95, hood: 0.8, deck: 0.98 },
    cabin: { ws: 0.14, rf: 0.0, rr: -0.18, re: -0.32 }, n: 3.4, tumble: 0.74,
    grille: 'kidneyTall', lights: 'bmw', rims: 'twin5', rimColor: '#202226', caliper: '#1f4fd1',
    exhaust: 'quad', roof: 'carbon', spoiler: 'lip', offroad: 0.8,
    perf: { top: 290, accel: 3.6, lat: 17.2, brake: 12, mass: 1700, gears: 8 },
  }),
  car({
    id: 'm3-aura', name: 'M-Three Sedan', brand: 'BMW', inspiredBy: 'BMW M3 sedan',
    category: 'Sports sedan', type: 'sedan', engine: 'i6',
    paint: { color: C.blue, finish: 'metallic' },
    dims: { L: 4.79, W: 1.9, H: 1.43, wb: 2.86, r: 0.355, gc: 0.17, belt: 0.97, hood: 0.82, deck: 1.0 },
    cabin: { ws: 0.16, rf: 0.05, rr: -0.19, re: -0.31 }, n: 3.5, tumble: 0.76,
    grille: 'kidneyTall', lights: 'bmw', rims: 'twin5', rimColor: '#c9ccd2', caliper: '#c41e1e',
    exhaust: 'quad', roof: 'carbon', spoiler: 'lip', offroad: 0.8,
    perf: { top: 285, accel: 3.7, lat: 16.8, brake: 11.8, mass: 1750, gears: 8 },
  }),
  car({
    id: 'm5-aura', name: 'M-Five Hybrid', brand: 'BMW', inspiredBy: 'BMW M5 (G90) sedan',
    category: 'Performance sedan', type: 'sedan', engine: 'v8',
    paint: { color: '#0b7a55', finish: 'metallic' },
    dims: { L: 5.1, W: 1.97, H: 1.51, wb: 3.01, r: 0.37, gc: 0.18, belt: 1.0, hood: 0.85, deck: 1.04 },
    cabin: { ws: 0.15, rf: 0.04, rr: -0.18, re: -0.3 }, n: 3.6, tumble: 0.77,
    grille: 'kidneyWide', lights: 'bmw', rims: 'twin5', rimColor: '#3a3d42', caliper: '#1f4fd1',
    exhaust: 'quad', roof: 'black', seat: '#c4561a', offroad: 0.85,
    perf: { top: 305, accel: 3.5, lat: 16.4, brake: 12, mass: 2400, gears: 8 },
  }),
  car({
    id: 'x5-aura', name: 'X-Five M Sport', brand: 'BMW', inspiredBy: 'BMW X5 luxury SUV',
    category: 'Luxury SUV', type: 'suv', engine: 'v8',
    paint: { color: C.white, finish: 'pearl' },
    dims: { L: 4.92, W: 2.0, H: 1.75, wb: 2.98, r: 0.4, gc: 0.3, belt: 1.12, hood: 1.0, deck: 1.12 },
    cabin: { ws: 0.17, rf: 0.04, rr: -0.4, re: -0.47 }, n: 4.2, tumble: 0.82,
    grille: 'kidneyWide', lights: 'bmw', rims: 'twin5', rimColor: '#2a2c30', caliper: '#1f4fd1', rails: true,
    exhaust: 'quad', offroad: 1.15, perf: { top: 250, accel: 4.4, lat: 13.8, brake: 10.4, mass: 2300, gears: 8 },
  }),

  // ───────────── Honda-inspired ─────────────
  car({
    id: 'civic-11', name: 'Civic Eleven', brand: 'Honda', inspiredBy: 'Honda Civic sedan (11th gen)',
    category: 'Sport sedan', type: 'sedan', engine: 'i4t',
    paint: { color: C.black, finish: 'gloss' },
    dims: { L: 4.67, W: 1.8, H: 1.42, wb: 2.73, r: 0.33, gc: 0.18, belt: 0.96, hood: 0.82, deck: 0.98 },
    cabin: { ws: 0.17, rf: 0.04, rr: -0.15, re: -0.34 }, n: 3.4, tumble: 0.76,
    grille: 'honda', lights: 'slim', rims: 'y5', rimColor: '#1e1f23',
    perf: { top: 210, accel: 7.9, lat: 14.6, brake: 10.4, mass: 1380, gears: 7 },
  }),
  car({
    id: 'typer-fl5', name: 'Type-R Evo', brand: 'Honda', inspiredBy: 'Honda Civic Type R hatchback',
    category: 'Hot hatch', type: 'hatch', engine: 'i4t',
    paint: { color: C.white, finish: 'gloss' },
    dims: { L: 4.59, W: 1.89, H: 1.41, wb: 2.74, r: 0.35, gc: 0.15, belt: 0.95, hood: 0.8, deck: 0.98 },
    cabin: { ws: 0.17, rf: 0.04, rr: -0.24, re: -0.44 }, n: 3.6, tumble: 0.76,
    grille: 'hondaR', lights: 'slim', tails: 'bar', rims: 'multi', rimColor: '#16171a', caliper: '#d11a2a',
    spoiler: 'wing', exhaust: 'triple', seat: '#b3121c', offroad: 0.8,
    perf: { top: 275, accel: 5.4, lat: 17.4, brake: 11.6, mass: 1430, gears: 6 },
  }),
  car({
    id: 'accord-x', name: 'Accord Prime', brand: 'Honda', inspiredBy: 'Honda Accord sedan',
    category: 'Executive sedan', type: 'sedan', engine: 'i4t',
    paint: { color: '#4a4f57', finish: 'metallic' },
    dims: { L: 4.97, W: 1.86, H: 1.45, wb: 2.83, r: 0.34, gc: 0.18, belt: 0.98, hood: 0.84, deck: 0.99 },
    cabin: { ws: 0.18, rf: 0.05, rr: -0.13, re: -0.33 }, n: 3.4, tumble: 0.77,
    grille: 'hondaWide', lights: 'slim', tails: 'bar', rims: 'y5',
    perf: { top: 220, accel: 7.1, lat: 14.4, brake: 10.4, mass: 1550, gears: 10 },
  }),
  car({
    id: 'crv-x', name: 'CR-Vista', brand: 'Honda', inspiredBy: 'Honda CR-V SUV',
    category: 'Compact SUV', type: 'suv', engine: 'i4t',
    paint: { color: '#8c1622', finish: 'metallic' },
    dims: { L: 4.69, W: 1.87, H: 1.68, wb: 2.7, r: 0.37, gc: 0.28, belt: 1.08, hood: 0.98, deck: 1.08 },
    cabin: { ws: 0.17, rf: 0.04, rr: -0.37, re: -0.46 }, n: 4, tumble: 0.8,
    grille: 'hondaWide', lights: 'slim', rims: 'y5', cladding: true, rails: true, offroad: 1.15,
    perf: { top: 200, accel: 8.6, lat: 13.2, brake: 9.8, mass: 1650, gears: 7 },
  }),
  car({
    id: 'city-x', name: 'City Spark', brand: 'Honda', inspiredBy: 'Honda City compact sedan',
    category: 'Compact sedan', type: 'sedan', engine: 'i4',
    paint: { color: '#c7ccd3', finish: 'metallic' },
    dims: { L: 4.55, W: 1.75, H: 1.47, wb: 2.6, r: 0.31, gc: 0.19, belt: 0.99, hood: 0.86, deck: 1.0 },
    cabin: { ws: 0.2, rf: 0.07, rr: -0.15, re: -0.3 }, n: 3.6, tumble: 0.78,
    grille: 'honda', lights: 'slim', rims: 'y5',
    perf: { top: 185, accel: 10.6, lat: 13.8, brake: 10, mass: 1150, gears: 6 },
  }),

  // ───────────── Additional ─────────────
  car({
    id: 'gtr-35', name: 'Godzilla R', brand: 'Nissan', inspiredBy: 'Nissan GT-R',
    category: 'Supercar', type: 'sports', engine: 'v6tt',
    paint: { color: '#7d838b', finish: 'metallic' },
    dims: { L: 4.71, W: 1.9, H: 1.37, wb: 2.78, r: 0.36, gc: 0.16, belt: 0.92, hood: 0.78, deck: 0.98 },
    cabin: { ws: 0.11, rf: 0.0, rr: -0.17, re: -0.36 }, n: 3.6, tumble: 0.72,
    grille: 'sport', lights: 'sharp', tails: 'rings', rims: 'multi', rimColor: '#2b2d30', caliper: '#e0b014',
    spoiler: 'wing', exhaust: 'quad', offroad: 0.85,
    perf: { top: 315, accel: 2.9, lat: 18, brake: 12.4, mass: 1750, gears: 6 },
  }),
  car({
    id: 'p911', name: 'Nine-Eleven S', brand: 'Porsche', inspiredBy: 'Porsche 911-style sports car',
    category: 'Sports car', type: 'sports', engine: 'flat6',
    paint: { color: C.yellow, finish: 'gloss' },
    dims: { L: 4.52, W: 1.85, H: 1.3, wb: 2.45, r: 0.35, gc: 0.15, belt: 0.88, hood: 0.7, deck: 0.94 },
    cabin: { ws: 0.08, rf: -0.06, rr: -0.16, re: -0.42 }, n: 3.1, tumble: 0.7,
    grille: 'porsche', lights: 'round', tails: 'bar', rims: 'y5', rimColor: '#c9ccd2', caliper: '#e0b014',
    spoiler: 'duck', exhaust: 'dual', offroad: 0.8,
    perf: { top: 310, accel: 3.0, lat: 18.2, brake: 12.6, mass: 1500, gears: 8 },
  }),
  car({
    id: 'amg-c', name: 'Stern C-Line', brand: 'Mercedes', inspiredBy: 'Mercedes-Benz C-Class (AMG Line)',
    category: 'Luxury performance sedan', type: 'sedan', engine: 'v6tt',
    paint: { color: C.black, finish: 'metallic' },
    dims: { L: 4.75, W: 1.82, H: 1.44, wb: 2.84, r: 0.35, gc: 0.17, belt: 0.98, hood: 0.84, deck: 1.0 },
    cabin: { ws: 0.15, rf: 0.04, rr: -0.17, re: -0.31 }, n: 3.5, tumble: 0.78,
    grille: 'diamond', lights: 'sharp', rims: 'multi', rimColor: '#9ea3ab', sunroof: true,
    perf: { top: 250, accel: 4.7, lat: 15.6, brake: 11, mass: 1750, gears: 9 },
  }),
  car({
    id: 'aura-x', name: 'AURA X', brand: 'Cars x Aura', inspiredBy: 'Original hypercar designed for Cars x Aura',
    category: 'Hypercar', type: 'hyper', engine: 'hyper',
    paint: { color: C.purple, finish: 'pearl' },
    dims: { L: 4.7, W: 2.05, H: 1.12, wb: 2.75, r: 0.36, gc: 0.12, belt: 0.78, hood: 0.6, deck: 0.86 },
    cabin: { ws: 0.2, rf: 0.04, rr: -0.12, re: -0.36 }, n: 2.8, tumble: 0.64,
    grille: 'aura', lights: 'aura', tails: 'bar', rims: 'turbine', rimColor: '#1a1b1f', caliper: '#22e6ff',
    spoiler: 'wing', exhaust: 'center', roof: 'black', seat: '#22e6ff', offroad: 0.75, plate: 'AUR',
    perf: { top: 380, accel: 2.3, lat: 20, brake: 13.2, mass: 1350, gears: 8 },
  }),
];

export const BRANDS = ['Toyota', 'BMW', 'Honda', 'Nissan', 'Porsche', 'Mercedes', 'Cars x Aura'];

export function getVehicle(id) {
  return VEHICLES.find((v) => v.id === id) || VEHICLES[0];
}

/** 0..100 bars for the garage. */
export function statBars(v) {
  const p = v.perf;
  const n = (x, a, b) => Math.round(Math.max(0, Math.min(1, (x - a) / (b - a))) * 100);
  return {
    speed: n(p.top, 140, 390),
    accel: n(14 - p.accel, 0, 12),
    handling: n(p.lat, 10, 20.5),
    braking: n(p.brake, 8, 13.5),
  };
}

/** Single performance index used to pick fair AI opponents. */
export function perfIndex(v) {
  const s = statBars(v);
  return s.speed * 0.4 + s.accel * 0.3 + s.handling * 0.2 + s.braking * 0.1;
}

export const ENGINE_LABEL = {
  v8: 'Twin-turbo V8', v6tt: 'Twin-turbo V6', i6: 'Turbo inline-6', i4: 'Inline-4', i4t: 'Turbo inline-4',
  diesel: 'Turbo diesel', flat6: 'Flat-6', hyper: 'Hybrid V12',
};
