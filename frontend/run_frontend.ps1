# PowerShell script to run Laveon Studio 360 React Frontend
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Starting Laveon Studio 360 Frontend UI" -ForegroundColor Green
Write-Host " URL: http://localhost:5173" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

npm run dev
