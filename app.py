"""Cars x Aura — Ultra-3D racing in the browser.

Created and developed by Saif Ur Rehman, a student and aspiring game developer from Pakistan.

Streamlit entry point. The game itself is JavaScript/Three.js (see frontend/); this file only hosts
it full-width. Run locally (Windows):

    python -m pip install -r requirements.txt
    python -m streamlit run app.py --server.port 8796
"""
import streamlit as st

from streamlit_app.game_component import cars_x_aura

st.set_page_config(
    page_title="Cars x Aura — 3D Racing by Saif Ur Rehman",
    page_icon="🏎️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Hide Streamlit chrome so the game fills the page.
st.markdown(
    """
    <style>
      #MainMenu, header, footer, [data-testid="stToolbar"], [data-testid="stDecoration"], [data-testid="stStatusWidget"] { display: none !important; }
      .stApp { background: #05060b; }
      .block-container { padding: 0 !important; max-width: 100% !important; }
      [data-testid="stVerticalBlock"] { gap: 0 !important; }
      iframe { display: block; border: 0; width: 100%; }
      .cxa-note { color: #8e95ad; font: 13px system-ui, sans-serif; text-align: center; padding: 6px 8px 10px; }
      .cxa-note b { color: #22e6ff; }
    </style>
    """,
    unsafe_allow_html=True,
)

cars_x_aura()

st.markdown(
    '<div class="cxa-note">Click the game once so it receives keyboard input · '
    "W A S D / arrows to drive · Space drift · Shift nitro · C camera · Esc pause · "
    "use <b>⛶</b> (top-right) for full screen · "
    "Created and developed by <b>Saif Ur Rehman</b>, Pakistan</div>",
    unsafe_allow_html=True,
)
