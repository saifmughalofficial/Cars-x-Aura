@echo off
title Cars x Aura - Streamlit
cd /d "%~dp0"
echo Starting Cars x Aura on http://localhost:8796  (close this window to stop)
python -m streamlit run app.py --server.port 8796 || py -m streamlit run app.py --server.port 8796
pause
