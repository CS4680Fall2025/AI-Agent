@echo off
set PYTHON_PATH=python

echo Installing dependencies...
"%PYTHON_PATH%" -m pip install -r requirements.txt

echo Starting server...
"%PYTHON_PATH%" server.py
pause