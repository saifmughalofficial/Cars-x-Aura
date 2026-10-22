# Deployment tests

## Local Streamlit (Windows 10, Python 3.12, Streamlit 1.64)

```powershell
python -m streamlit run app.py --server.port 8796
```

| Check | Result |
|---|---|
| `http://localhost:8796` returns 200 | ✅ |
| The game is served as a Streamlit component at `/component/streamlit_app.game_component.cars_x_aura/index.html` | ✅ |
| All ES modules, the vendored Three.js and the fonts load through Streamlit's file server (no 404s, correct MIME types) | ✅ |
| The bridge sizes the iframe to the window (728 px tall in a 768 px window) | ✅ |
| The iframe grants `allow="fullscreen"`, and the ⛶ button opens the game in its own tab | ✅ |
| PLAY starts a race inside Streamlit; the car drives (82 km/h after 3 s at 60 FPS) | ✅ |
| Audio context running after the first click | ✅ |
| localStorage works inside the component iframe (same origin) | ✅ |
| No JavaScript errors | ✅ |

## Plain static server

`python -m http.server` in `frontend/` (used by `PLAY_GAME.bat` and by the test suite): ✅ all 42 checks.

## Streamlit Community Cloud readiness (checked against the repository)

| Requirement | Status |
|---|---|
| Entry point `app.py` at the repository root | ✅ |
| `requirements.txt` holds only `streamlit>=1.36,<2`, with no native or GPU dependencies | ✅ |
| No API keys, secrets, database or paid services | ✅ |
| `.streamlit/config.toml` does **not** set a port (Cloud health-checks 8501) | ✅ |
| Every runtime file lives inside the repository (`frontend/`, including `lib/` and `assets/fonts/`, about 1.7 MB) | ✅ |
| No absolute or local file paths; the component path is resolved relative to `streamlit_app/game_component.py` | ✅ |
| Clear error message if `frontend/` is missing from the deployment | ✅ (`FileNotFoundError` with instructions) |

The public Cloud deployment itself is not done yet. It needs the developer's GitHub account (see README → *Deploy for free on Streamlit Community Cloud*). After deploying, check the following on the public URL:

1. The menu loads, and there are no 404s in DevTools → Network.
2. PLAY starts a race. Click the game, and W drives the car.
3. Settings → Quality changes apply, and a page refresh keeps your settings.
4. Open the URL on a phone in landscape: touch controls appear.

## Browser compatibility

| Browser | Status |
|---|---|
| Chrome (Windows) | ✅ full automated suite (42/42) |
| Microsoft Edge (Windows) | ✅ race loads and drives (84 km/h after 3 s, 60 FPS, WebGL 2, no errors) |
| Firefox (Playwright build, Windows) | ✅ race loads and drives (82 km/h after 3 s, 47 FPS headless, WebGL 2, no errors) |
| Safari / WebKit | ⚠️ Not verified: Playwright's WebKit crashes on this machine before opening a page (an environment issue). The code includes the import-map polyfill, a `webkitAudioContext` fallback, audio unlock on gesture and a WebGL 1 fallback. Test on a real iPhone or Mac before relying on it. |
| Mobile Chrome (Android emulation, touch) | ✅ tested automatically |
