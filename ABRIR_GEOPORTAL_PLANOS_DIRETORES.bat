@echo off
title Geoportal Planos Diretores do Brasil
cd /d "%~dp0"
echo =====================================================================
echo  GEOPORTAL PLANOS DIRETORES DO BRASIL (Backend + WebGIS Integrado)
echo =====================================================================
echo.
if not exist "apps\webgis\dist\index.html" (
  echo Compilando WebGIS pela primeira vez...
  cd apps\webgis && call npm run build && cd ..\..
)
start "API Planos Diretores" cmd /c "backend\.venv\Scripts\python.exe -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak >nul
start "" "http://localhost:5173/"
cd apps\webgis
call npm run dev -- --open
