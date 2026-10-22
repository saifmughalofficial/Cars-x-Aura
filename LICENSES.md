# Licences, assets and attributions

## Original work: Cars x Aura

All game code (JavaScript, CSS, HTML and Python) was written for Cars x Aura, created and developed by Saif Ur Rehman. Every asset in the game is generated **at runtime from that code**, so the repository contains no image, 3D-model or audio files:

| Asset type | How it is made | File |
|---|---|---|
| 20 car models | Procedural superellipse lofts plus parts | `frontend/vehicles/VehicleFactory.js` |
| Tracks, terrain, buildings, trees, signs | Procedural geometry | `frontend/tracks/*.js` |
| Road, sand, grass, windows, truck-art, plates, signs | Drawn on `<canvas>` | `frontend/game/textures.js` |
| Engine sounds, effects, music | Web Audio synthesis | `frontend/game/AudioManager.js` |
| Logo, UI and HUD | CSS / canvas | `frontend/styles.css`, `frontend/ui/*.js` |

The car designs are original. They follow the general proportions of real body styles (photos supplied by the developer were used only as proportion references and are **not** included in the game). No manufacturer logos, badges or proprietary 3D models are used. The truck-art panels are an original pattern inspired by the Pakistani folk-art tradition. No proprietary game code, artwork, maps, sounds or branding from Asphalt 8: Airborne (Gameloft) or any other game is used.

## Third-party open-source components (vendored in `frontend/lib/`)

| Component | Version | Licence | Licence file |
|---|---|---|---|
| [three.js](https://threejs.org) (core + EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass, shaders) | r160 | MIT | `frontend/lib/three/LICENSE` |
| [es-module-shims](https://github.com/guybedford/es-module-shims) | 1.10.0 | MIT | `frontend/lib/es-module-shims/LICENSE` |

## Fonts (vendored in `frontend/assets/fonts/`)

| Font | Copyright | Licence |
|---|---|---|
| Orbitron | Copyright 2018 The Orbitron Project Authors (https://github.com/theleagueof/orbitron) | SIL Open Font License 1.1 |
| Rajdhani | Copyright 2014 Indian Type Foundry (info@indiantypefoundry.com) | SIL Open Font License 1.1 |

The full licence text is in `frontend/assets/fonts/OFL.txt`.

## Hosting

| Component | Licence |
|---|---|
| [Streamlit](https://streamlit.io) (installed from PyPI, not vendored) | Apache License 2.0 |
| Playwright (optional, for the test suite only) | Apache License 2.0 |

## Trademarks

Toyota, Land Cruiser, Prado, Fortuner, Hilux, Corolla, Supra, BMW, M3, M4, M5, X5, Honda, Civic, Type R, Accord, CR-V, City, Nissan, GT-R, Porsche, 911, Mercedes-Benz, C-Class, AMG, Gameloft and Asphalt are trademarks of their respective owners. They appear only in "inspired by" descriptions, to identify the real-world body style behind each original model. Cars x Aura is not affiliated with, endorsed or sponsored by any of these companies. Before any commercial release, review the trademark use with a legal adviser, or rename the "inspired by" lines.
