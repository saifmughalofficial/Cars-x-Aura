"""Automated browser tests for Cars x Aura.

Starts a local static server for frontend/, drives the real game in Chrome/Chromium through
Playwright, and checks the menus, every game mode, physics sanity, AI, saving, touch controls and
GPU-memory hygiene. Screenshots and a JSON report are written to tests/output/.

Setup (once, Windows):
    py -m pip install playwright
    py -m playwright install chromium          (or use your installed Chrome: --channel chrome)
Run:
    py tests/run_tests.py                       (add --channel chrome to use installed Chrome)
    py tests/run_tests.py --streamlit http://localhost:8796   (also checks the Streamlit embed)
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import socketserver
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
OUT = Path(__file__).resolve().parent / "output"

results: list[dict] = []


def check(name: str, ok, info="") -> None:
    results.append({"test": name, "pass": bool(ok), "info": str(info)})
    print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info != "" else ""), flush=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # keep the test output readable
        pass


def serve() -> tuple[socketserver.TCPServer, int]:
    handler = functools.partial(QuietHandler, directory=str(FRONTEND))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


STATE = """() => { const g = window.cxa, p = g.player.phys; return { state: g.race.state, kmh: p.kmh, y: p.y, ground: p.q.groundY,
  d: p.q.d, wall: g.track.wallD, grounded: p.grounded, gear: p.gear, rpm: p.rpm, airTime: p.airTime, drifting: p.drifting,
  angle: p.driftAngle, nitro: p.nitro, wheel: g.player.model.wheels[0].spin.rotation.x, brake: g.player.model.mats.tail.emissiveIntensity } }"""

ADVANCE = """async () => { const g = window.cxa, t = g.track, p = g.player.phys, r = g.race;
  const dist = r.distance === Infinity ? t.L : r.distance; const hops = Math.ceil(dist / 60) + 6;
  for (let k = 0; k < hops && !g.player.race.finished; k++) { p.placeAt((p.q.s + 60) % t.L, 0);
    p.vx = Math.sin(p.h) * 40; p.vz = Math.cos(p.h) * 40; await new Promise(res => setTimeout(res, 30)); }
  return { finished: g.player.race.finished, laps: g.player.race.lapTimes.length, state: r.state }; }"""


def start_race(pg, **setup):
    s = {"mode": "circuit", "track": "pakistan-highway", "laps": 1, "opponents": 3, "difficulty": "normal", "traffic": False, **setup}
    pg.evaluate(f"window.cxa.startRace({json.dumps(s)})")
    pg.wait_for_function("window.cxa.race && (window.cxa.race.state === 'race' || window.cxa.race.state === 'free')", timeout=90000)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default=None, help="e.g. chrome or msedge to use an installed browser")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--streamlit", default=None, help="URL of a running Streamlit app to verify the embed")
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    httpd, port = serve()
    base = f"http://127.0.0.1:{port}/index.html"
    gl_args = ["--ignore-gpu-blocklist", "--enable-gpu"]
    if sys.platform == "win32":
        gl_args += ["--use-gl=angle", "--use-angle=d3d11"]  # real GPU in headless Chrome on Windows
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel=args.channel, headless=not args.headed, args=gl_args)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # ── boot + menu
        t0 = time.time()
        page.goto(base + "?q=medium")
        page.wait_for_function("window.__booted === true", timeout=60000)
        check("game boots", True, f"{time.time() - t0:.1f}s, GPU: {page.evaluate('window.cxa.renderer.getContext().getParameter(window.cxa.renderer.getContext().VERSION)')}")
        check("main menu shown with developer credit", page.is_visible(".screen.menu.active") and "Saif Ur Rehman" in page.inner_text(".menu-credit"))
        page.screenshot(path=str(OUT / "01_menu.png"))

        # ── garage + paint persistence
        page.click("[data-go=garage]")
        page.wait_for_selector(".screen.garage.active")
        count = page.evaluate("document.querySelectorAll('.g-item').length")
        check("garage lists 20 vehicles", count == 20, count)
        page.click(".g-item[data-id=hilux-revo]")
        page.click('.swatch[data-c="#0f6b4c"]')
        page.click(".g-finish button[data-v=pearl]")
        page.screenshot(path=str(OUT / "02_garage.png"))
        page.click(".g-nav [data-act=select]")
        saved = page.evaluate("JSON.parse(localStorage.getItem('cxa.save.v1'))")
        check("car selection + paint saved locally", saved["selectedCar"] == "hilux-revo" and saved["paints"]["hilux-revo"]["finish"] == "pearl")
        page.reload()
        page.wait_for_function("window.__booted === true", timeout=60000)
        check("selection survives page refresh", page.evaluate("window.cxa.save.data.selectedCar") == "hilux-revo")

        # ── settings
        page.click("[data-go=settings]")
        page.click(".r-units button[data-v=mph]")
        page.click(".modal.settings [data-act=close]")
        check("settings saved (units)", page.evaluate("JSON.parse(localStorage.getItem('cxa.save.v1')).settings.units") == "mph")
        page.click("[data-go=settings]")
        page.click(".modal.settings [data-act=reset]")
        page.click(".modal.settings [data-act=close]")
        check("reset settings", page.evaluate("window.cxa.save.settings.units") == "kmh")

        # ── vehicle build: all 20 cars construct without errors
        n = page.evaluate("""async () => { const m = await import('./vehicles/VehicleConfig.js'); const g = window.cxa; let k = 0;
            for (const v of m.VEHICLES) { g.showroom.setCar(v, v.paint); k++; } return k; }""")
        check("all vehicle models build", n == 20 and not errors, n)

        # ── physics on the highway (M5)
        page.evaluate("window.cxa.save.data.selectedCar = 'm5-aura'")
        start_race(page, mode="circuit", track="pakistan-highway", laps=1, opponents=5)
        page.mouse.click(640, 400)
        s0 = page.evaluate(STATE)
        check("car rests on the road at the start", abs(s0["y"] - s0["ground"]) < 0.05 and s0["grounded"], f"y={s0['y']:.2f} ground={s0['ground']:.2f}")
        page.keyboard.down("KeyW")
        time.sleep(4)
        s1 = page.evaluate(STATE)
        check("accelerates (W)", s1["kmh"] > 80, f"{s1['kmh']:.0f} km/h after 4 s")
        check("automatic gearbox shifts up", s1["gear"] >= 1, s1["gear"])
        check("wheels rotate", abs(s1["wheel"]) > 10, f"{s1['wheel']:.1f} rad")
        check("stays on the ground on normal driving", abs(s1["y"] - s1["ground"]) < 0.3, f"{s1['y'] - s1['ground']:.3f}")
        page.screenshot(path=str(OUT / "03_highway.png"))
        page.keyboard.down("ShiftLeft")
        time.sleep(1)
        s2 = page.evaluate(STATE)
        check("nitro drains when used", s2["nitro"] < s1["nitro"], f"{s1['nitro']:.2f} -> {s2['nitro']:.2f}")
        page.keyboard.up("ShiftLeft")
        page.keyboard.up("KeyW")
        page.keyboard.down("KeyS")
        time.sleep(0.4)
        s3 = page.evaluate(STATE)
        check("brakes + brake lights", s3["kmh"] < s2["kmh"] and s3["brake"] > 2, f"{s2['kmh']:.0f}->{s3['kmh']:.0f} km/h, lamp {s3['brake']}")
        time.sleep(4)
        page.keyboard.up("KeyS")
        page.keyboard.down("KeyS")
        time.sleep(2)
        s4 = page.evaluate("({ vL: window.cxa.player.phys.vL, gear: window.cxa.player.phys.gear })")
        page.keyboard.up("KeyS")
        check("reverses (S when stopped)", s4["vL"] < -0.5 and s4["gear"] == -1, f"vL={s4['vL']:.1f}")
        page.keyboard.press("KeyR")
        time.sleep(0.2)
        # steering + walls
        page.keyboard.down("KeyW")
        time.sleep(2.5)
        page.keyboard.down("KeyD")
        time.sleep(2.5)
        s5 = page.evaluate(STATE)
        page.keyboard.up("KeyD")
        check("walls keep the car on the track", abs(s5["d"]) <= s5["wall"] + 0.05, f"d={s5['d']:.2f} wall={s5['wall']}")
        # controlled drift
        page.keyboard.press("KeyR")
        time.sleep(3)
        page.keyboard.down("KeyA")
        page.keyboard.down("Space")
        time.sleep(0.35)
        page.keyboard.up("Space")
        time.sleep(0.5)
        s6 = page.evaluate(STATE)
        page.keyboard.up("KeyA")
        page.keyboard.up("KeyW")
        check("handbrake + steer starts a controlled drift", s6["drifting"] and 0.1 < abs(s6["angle"]) < 1.3, f"angle={s6['angle']:.2f} rad")
        r = page.evaluate(ADVANCE)
        check("circuit race finishes", r["finished"], r)
        page.wait_for_selector(".modal.results:not(.hidden)", timeout=10000)
        page.screenshot(path=str(OUT / "04_results.png"))
        check("results show 6 drivers", page.evaluate("document.querySelectorAll('.r-table tbody tr').length") == 6)

        # ── desert: jumps + AI full lap at 4x speed
        start_race(page, mode="circuit", track="desert-storm", laps=1, opponents=7, difficulty="hard")
        page.evaluate("""async () => { const m = await import('./game/AIController.js'); const g = window.cxa;
            g.autopilot = new m.AIController(g.player, g.track, 'hard'); g.loop.timeScale = 4; }""")
        max_air, under, out = 0.0, 0, 0
        t0 = time.time()
        while time.time() - t0 < 75:
            st = page.evaluate("""() => { const g = window.cxa; return { fin: g.cars.filter(c => c.race.finished).length, n: g.cars.length,
                air: Math.max(...g.cars.map(c => c.phys.airTime)), under: g.cars.filter(c => c.phys.y < c.phys.q.groundY - 0.3).length,
                out: g.cars.filter(c => Math.abs(c.phys.q.d) > g.track.wallD + 0.3).length } }""")
            max_air = max(max_air, st["air"])
            under += st["under"]
            out += st["out"]
            if st["fin"] == st["n"]:
                break
            time.sleep(0.4)
        fin = page.evaluate("window.cxa.cars.filter(c => c.race.finished).length")
        stats = page.evaluate("window.cxa.stats")
        check("all 8 cars (AI-driven) finish a Desert Storm lap", fin == 8, f"{fin}/8, AI resets {stats['aiResets']}")
        check("ramps launch cars airborne", max_air > 0.4, f"max air {max_air:.2f}s")
        check("no car falls through the ground or leaves the walls", under == 0 and out == 0, f"under={under} out={out}")
        page.evaluate("window.cxa.loop.timeScale = 1")

        # ── neon city time trial + ghost
        start_race(page, mode="timetrial", track="neon-city", laps=1)
        page.screenshot(path=str(OUT / "05_neon.png"))
        r = page.evaluate(ADVANCE)
        check("time trial finishes", r["finished"], r)
        page.wait_for_selector(".modal.results:not(.hidden)", timeout=10000)
        check("ghost + best lap saved", page.evaluate("!!localStorage.getItem('cxa.ghost.v1.neon-city') && !!window.cxa.save.data.bestLaps['neon-city']"))

        # ── sprint with traffic, drift challenge, free drive
        start_race(page, mode="sprint", track="pakistan-highway", opponents=7, traffic=True)
        check("highway traffic spawned", page.evaluate("window.cxa.traffic.bodies.length") == 10)
        r = page.evaluate(ADVANCE)
        check("sprint finishes", r["finished"], r)
        page.wait_for_selector(".modal.results:not(.hidden)", timeout=10000)
        start_race(page, mode="drift", track="pakistan-highway")
        page.keyboard.down("KeyW")
        time.sleep(3)
        # flick into a drift, hold it briefly, then counter-steer out like a player would
        page.keyboard.down("KeyD")
        page.keyboard.down("Space")
        time.sleep(0.25)
        page.keyboard.up("Space")
        time.sleep(0.05)
        page.keyboard.up("KeyD")
        page.keyboard.down("KeyA")
        time.sleep(0.45)
        page.keyboard.up("KeyA")
        page.keyboard.up("KeyW")
        time.sleep(1.4)
        score = page.evaluate("window.cxa.race.drift.score")
        check("drift challenge scores controlled drifts", score > 0, f"{score:.0f} pts")
        page.evaluate("window.cxa.race.time = 89.9")
        page.wait_for_selector(".modal.results:not(.hidden)", timeout=12000)
        start_race(page, mode="free", track="neon-city")
        page.keyboard.press("Escape")
        time.sleep(0.3)
        check("pause menu", page.is_visible(".modal.pause:not(.hidden)"))
        page.click(".modal.pause [data-act=resume]")
        for i in range(6):
            page.keyboard.press("KeyC")
            time.sleep(0.25)
        check("camera cycles through 6 views", page.evaluate("window.cxa.cameraRig.mode") == 0)
        page.click("#hud [data-act=pause]")
        page.click(".modal.pause [data-act=quit]")
        check("quit to menu", page.is_visible(".screen.menu.active"))
        mem = page.evaluate("window.cxa.renderer.info.memory")
        check("GPU memory released between races", mem["geometries"] < 1500 and mem["textures"] < 200, mem)

        # ── quality presets
        for q in ["low", "medium", "high", "ultra"]:
            page.goto(base + f"?q={q}&race=circuit&track=neon-city&opp=5")
            page.wait_for_function("window.cxa && window.cxa.race && window.cxa.race.state === 'race'", timeout=90000)
            time.sleep(3)
            fps = page.evaluate("window.cxa.adaptive.fps")
            check(f"'{q}' preset renders", fps > 5, f"{fps:.0f} FPS (headless)")
        page.screenshot(path=str(OUT / "06_ultra.png"))
        check("no JavaScript errors", not errors, " | ".join(errors[:4]))

        # ── touch device
        ctx = browser.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        m = ctx.new_page()
        m.goto(base)
        m.wait_for_function("window.__booted === true", timeout=60000)
        m.tap("[data-go=play]")
        m.wait_for_function("window.cxa.race && window.cxa.race.state === 'race'", timeout=90000)
        check("touch controls shown on touch devices", m.is_visible(".tbtn.gas"))
        m.locator(".tbtn.gas").dispatch_event("pointerdown", {"pointerId": 1, "pointerType": "touch"})
        time.sleep(2)
        kmh = m.evaluate("window.cxa.player.phys.kmh")
        m.locator(".tbtn.gas").dispatch_event("pointerup", {"pointerId": 1, "pointerType": "touch"})
        check("touch GAS accelerates", kmh > 30, f"{kmh:.0f} km/h")
        m.evaluate("window.dispatchEvent(new Event('blur'))")
        check("controls released on focus loss", not any(m.evaluate("Object.values(window.cxa.input.touch)")))
        m.screenshot(path=str(OUT / "07_mobile.png"))
        ctx.close()

        # ── streamlit embed (optional)
        if args.streamlit:
            s = browser.new_page(viewport={"width": 1366, "height": 768})
            s.goto(args.streamlit)
            handle = s.wait_for_selector("iframe[title*=cars_x_aura]", timeout=90000)
            fr = handle.content_frame()
            check("Streamlit serves the game component", fr is not None, fr.url[:90] if fr else "")
            if fr:
                fr.wait_for_function("window.__booted === true", timeout=90000)
                fr.click("[data-go=play]")
                fr.wait_for_function("window.cxa.race && window.cxa.race.state === 'race'", timeout=90000)
                check("race runs inside Streamlit", True)
                s.screenshot(path=str(OUT / "08_streamlit.png"))
        browser.close()
    httpd.shutdown()
    passed = sum(r["pass"] for r in results)
    (OUT / "report.json").write_text(json.dumps({"passed": passed, "total": len(results), "results": results}, indent=2), encoding="utf-8")
    print(f"\n{passed}/{len(results)} checks passed. Screenshots + report.json in {OUT}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
