@echo off
set PYTHON_PATH=C:\Users\johns\AppData\Local\Programs\Python\Python313\python.exe

echo Installing dependencies...
"%PYTHON_PATH%" -m pip install -r requirements.txt

echo Starting server...
"%PYTHON_PATH%" server.py
pause
