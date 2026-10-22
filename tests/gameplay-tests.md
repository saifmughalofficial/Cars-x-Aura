# Gameplay tests

**Run:** 22 Oct 2026. **Tool:** `python tests/run_tests.py --channel chrome --streamlit http://localhost:8796`. **Result:** **42 / 42 checks passed**, with no JavaScript errors during the whole run.

Screenshots from the run are written to `tests/output/` (git-ignored). A curated set is in `docs/screenshots/`.

## Menus, garage and saving

| Check | Result |
|---|---|
| Game boots | ✅ 2.0 s to the main menu (WebGL 2) |
| Main menu shows the developer credit | ✅ |
| Garage lists all vehicles | ✅ 20 |
| All 20 vehicle models build without errors | ✅ |
| Car selection and paint (colour + Pearl finish) saved to localStorage | ✅ |
| Selection survives a page refresh | ✅ |
| Settings saved (units → mph), Reset settings restores defaults | ✅ |

## Game modes

| Mode | Track | Check | Result |
|---|---|---|---|
| Circuit Race | Pakistan Highway | finishes, results table lists 6 drivers | ✅ |
| Circuit Race (AI-driven) | Desert Storm | all 8 cars finish a lap, 0 AI resets | ✅ |
| Time Trial | Neon City | finishes, best lap and ghost saved | ✅ |
| Time Trial (repeat) | Desert Storm | the saved ghost car is loaded and replayed | ✅ (earlier flow test) |
| Sprint + traffic | Pakistan Highway | 10 traffic vehicles spawned, race finishes | ✅ |
| Drift Challenge | Pakistan Highway | a controlled drift is scored; the 90 s timer ends the run | ✅ 14 pts for a 0.6 s flick |
| Free Drive | Neon City | pause, resume, 6 cameras cycled, quit to menu | ✅ |

The drift chain is cancelled if you hit a wall during it (by design). An earlier version of this test steered straight into the barrier and correctly scored 0, so the test now counter-steers like a player would.

## Controls

| Check | Result |
|---|---|
| Keyboard: accelerate, brake, reverse, steer, handbrake, nitro, camera (C), reset (R), pause (Esc) | ✅ |
| Touch controls appear on touch devices (844×390 phone, DPR 2) | ✅ |
| Touch GAS accelerates (56 km/h after 2 s) | ✅ |
| All held controls are released when the window loses focus | ✅ |
| Mobile HUD layout: speedometer centred between the thumb controls, standings hidden | ✅ (screenshot reviewed) |

## Graphics presets (headless Chrome on Intel UHD 620, 1280×720, Neon City with 6 cars)

| Preset | FPS |
|---|---|
| Low | 60 |
| Medium (auto-detected for this GPU) | 60 |
| High (bloom) | 60 |
| Ultra (bloom + radial blur, 4096² shadows) | 53–55 |

On real full-screen displays, adaptive resolution lowers the render scale if the frame rate drops below about 48 FPS.

## Memory

After six races on three tracks, the renderer holds **34 geometries and 34 textures**. Everything from each race (track, cars, effects, environment, post-processing) is disposed when you leave it, so nothing builds up between races.

## Bugs found and fixed during testing

| Issue | Fix |
|---|---|
| SUV and pickup wheels were placed under the body (side extent measured below the sill) | Measure the body side above the sill. |
| Greenhouse looked like a convertible (glass too transparent) | Tinted glass at 96 % opacity, plus window-line trim and a headliner; the cockpit view uses 28 % opacity so you can see out. |
| Headlight beams rendered as glowing domes | The cone gradient was inverted; fixed the UV orientation. |
| Neon City windows blown out | Fewer lit windows and lower emissive intensity. |
| A third of the highway was on viaducts | Bridges are limited to river, canyon and harbour zones. |
| AI cars side-swiped each other (311 contacts per lap) | Avoidance now covers cars alongside, and the AI holds back when boxed in (36 contacts per lap). |
| Two-door cockpit camera sat behind the roof | The seat is now positioned from the roof line. |
| Flag emoji rendered as "PK" on Windows | Replaced with an inline SVG Pakistan flag. |
