# PowerShell script to run Laveon Studio 360 FastAPI Backend
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Ensure user tools are on PATH
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$env:Path = "$HOME\.local\bin;$userPath;$machinePath;$env:Path"

$venvPython = Join-Path $scriptDir ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Virtual environment not found. Initializing..." -ForegroundColor Yellow
    uv venv .venv --python 3.11
    uv pip install -r requirements.txt
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Starting Laveon Studio 360 Backend API" -ForegroundColor Green
Write-Host " Host: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host " Docs: http://127.0.0.1:8000/docs" -ForegroundColor Cyan
Write-Host " Health: http://127.0.0.1:8000/api/health" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

& $venvPython -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
