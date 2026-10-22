"""Streamlit integration for the Cars x Aura browser game.

The game is a static Three.js web app in ``frontend/``. Streamlit's custom-component system serves
that folder over the Streamlit server itself (``/component/<name>/...``) with correct MIME types for
ES modules, fonts and textures, so it works the same locally and on Streamlit Community Cloud —
no local file paths, no extra web server and no API keys.

All gameplay runs in the player's browser (WebGL + Web Audio). Python never renders frames; it only
hosts the page, which is why the game stays smooth regardless of Streamlit reruns.
"""
from __future__ import annotations

from pathlib import Path

import streamlit.components.v1 as components

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

_component = None


def _declare():
    global _component
    if _component is None:
        if not (FRONTEND_DIR / "index.html").is_file():
            raise FileNotFoundError(
                f"Cars x Aura frontend not found at {FRONTEND_DIR}. "
                "Make sure the 'frontend' folder was committed to the repository."
            )
        _component = components.declare_component("cars_x_aura", path=str(FRONTEND_DIR))
    return _component


def cars_x_aura(key: str = "cars_x_aura"):
    """Render the game. The page sizes its own iframe to the browser window."""
    return _declare()(key=key, default=None)
