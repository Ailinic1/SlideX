@echo off
REM Starts SlideX in a window of its own.
REM
REM The window is pywebview around the local server. If pywebview is not there
REM yet, this sets it up once - a .venv beside the program, with pywebview in
REM it - and opens the window. Only if that cannot be done (no Python, no
REM connection the first time) does it open in your browser, and it says why.
REM
REM   SlideX.bat              the window, setting it up the first time
REM   SlideX.bat --browser    the browser, on purpose
REM   SlideX.bat --setup      try setting up the window again after it failed
setlocal EnableDelayedExpansion
set "DIR=%~dp0"
set "VENV=%DIR%.venv"
set "FAILED=%DIR%.venv.setup-failed"

set "NODE="
if exist "%DIR%runtime\node\node.exe" set "NODE=%DIR%runtime\node\node.exe"
if not defined NODE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE=node"
)
if not defined NODE (
  echo SlideX needs Node.js ^(version 18 or newer^).
  echo Download it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if /i "%~1"=="--browser" (
  "%NODE%" "%DIR%src\server.js"
  exit /b %errorlevel%
)
set "SETUP_AGAIN=0"
if /i "%~1"=="--setup" (
  set "SETUP_AGAIN=1"
  shift
)

REM 1. A pywebview already here: the .venv beside the program, or the machine's.
if exist "%VENV%\Scripts\python.exe" (
  "%VENV%\Scripts\python.exe" -c "import webview" >nul 2>nul
  if not errorlevel 1 (
    "%VENV%\Scripts\python.exe" "%DIR%slidex.py" %1 %2 %3 %4
    exit /b !errorlevel!
  )
)
set "PY="
where py >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if not defined PY (
  where python >nul 2>nul
  if not errorlevel 1 (
    REM The "python" Windows ships is a shortcut to the Store, which runs nothing.
    python -c "import sys" >nul 2>nul
    if not errorlevel 1 set "PY=python"
  )
)
if not defined PY (
  echo Opening in your browser ^(there is no Python for the window - get it from https://www.python.org^).
  "%NODE%" "%DIR%src\server.js"
  exit /b %errorlevel%
)
%PY% -c "import webview" >nul 2>nul
if not errorlevel 1 (
  %PY% "%DIR%slidex.py" %1 %2 %3 %4
  exit /b !errorlevel!
)

REM 2. Set pywebview up, once. A failure is remembered so every start is not
REM    a wait for pip; SlideX.bat --setup tries again.
if exist "%FAILED%" if "%SETUP_AGAIN%"=="0" (
  echo Opening in your browser ^(setting up the window failed before - run SlideX.bat --setup to try again^).
  "%NODE%" "%DIR%src\server.js"
  exit /b %errorlevel%
)
echo Setting up the SlideX window ^(once; this needs an internet connection^)...
if exist "%FAILED%" del "%FAILED%"
%PY% -m venv "%VENV%" >nul 2>nul && "%VENV%\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r "%DIR%requirements.txt" && "%VENV%\Scripts\python.exe" -c "import webview" >nul 2>nul
if not errorlevel 1 (
  echo Done.
  "%VENV%\Scripts\python.exe" "%DIR%slidex.py" %1 %2 %3 %4
  exit /b !errorlevel!
)
echo %date% %time% > "%FAILED%"
echo Opening in your browser ^(pywebview could not be installed^).
"%NODE%" "%DIR%src\server.js"
