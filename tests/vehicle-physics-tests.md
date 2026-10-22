# Vehicle physics tests

**Run:** 22 Oct 2026. **Tool:** `tests/run_tests.py` (Playwright + Chrome, headless, real GPU through ANGLE/D3D11). **Machine:** Intel i5-8250U, Intel UHD 620, Windows 10.

The physics runs at a fixed 120 Hz step (`GameLoop.js`), so these results do not depend on frame rate. The 8-car AI lap below ran at a 4× time scale and produced the same lap times as real-time runs.

## Automated checks (all passed)

| # | Check | Result |
|---|---|---|
| 1 | The car rests exactly on the road at the start | y = 1.96, ground = 1.96 |
| 2 | Accelerates on W (M-Five Hybrid, M5-inspired) | 100 km/h after 4 s of holding W (standing start, gear changes included) |
| 3 | The automatic gearbox shifts up | 2nd gear by 4 s |
| 4 | Wheels rotate with speed | 159.7 rad after 4 s |
| 5 | Stays on the ground in normal driving | height above road = 0.000 m |
| 6 | Nitro drains while active | 0.48 → 0.19 in 1 s |
| 7 | Brakes, and the brake lights turn on | 153 → 131 km/h in 0.4 s; tail-lamp intensity 3.4 (0.7 when not braking) |
| 8 | Reverses with S when stopped | v = −9.6 m/s, gear R |
| 9 | Walls keep the car inside the track | lateral offset 8.48 m with the wall at 10 m, after 2.5 s of full steering into it |
| 10 | Handbrake + steer starts a controlled drift | drift angle 0.39 rad (≈ 22°) |
| 11 | Ramps launch cars | longest airtime 1.12–1.46 s (Desert Storm) |
| 12 | Nobody falls through the ground or leaves the walls during an 8-car lap | 0 / 0 samples |

## Lap-time sanity (AI driving every car, 8 cars, hard AI)

| Track | Length | Winning lap | Slowest lap | AI resets |
|---|---|---|---|---|
| Pakistan Highway | 3.95 km | 58.3 s (Nine-Eleven S) | 72.9 s | 0 |
| Desert Storm | 3.45 km | 69.5 s (Nine-Eleven S) | 79.6 s | 0 |
| Neon City | 2.92 km | 60.1 s (Godzilla R) | 70.2 s | 0 |

A solo M-Five Hybrid laps Desert Storm in 73.8 s. Its speed trace showed full-throttle sections at 230–250 km/h, braking to 105–120 km/h for the hairpins, and two jumps with about 0.55 s of airtime each.

## Tuning notes

- **Engine force:** `a0 = (27.78 / t0-100) / (1 − (27.78 / vTop)² / 3)`, with acceleration `a0 · (1 − (v / vTop)²)`. This reproduces the catalogue 0–100 time and caps the car at its top speed.
- **Cornering:** the yaw rate is capped at `grip · preset / v`, so every car corners at its own lateral-g limit. Arcade adds 20 % grip; Professional allows overload slides.
- **Drift:** while drifting, lateral grip drops from 15 /s to 2.7 /s. Up to 80 % of the scrubbed lateral energy is returned as forward speed, so drifts don't kill momentum. Above about 60° extra grip is added, which prevents spinning in place.
- **Jumps:** the car follows the ground until the ground drops faster than gravity (18 m/s² in arcade). Landing triggers suspension compression, dust and camera shake.

## Manual checks still to do on real hardware

- Feel of keyboard steering at each sensitivity (0.6–1.4) and handling preset.
- Gamepad play on a physical controller. The mapping is coded but has not been exercised with a real pad.
