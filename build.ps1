$ErrorActionPreference = "Stop"

$releaseRoot = Join-Path (Get-Location) "release"
$releaseDir = Join-Path $releaseRoot (Get-Date -Format "yyyyMMdd-HHmmss")
$workDir = Join-Path (Get-Location) "build\pyinstaller"
$specDir = Join-Path (Get-Location) "build\spec"
$resourceFile = Join-Path (Get-Location) "ai_humanizer\resources\system-prompt-example1.md"

New-Item -ItemType Directory -Force $releaseRoot, $releaseDir, $workDir, $specDir | Out-Null

python -m PyInstaller `
  --noconfirm `
  --clean `
  --name AIHumanizer `
  --windowed `
  --distpath $releaseDir `
  --workpath $workDir `
  --specpath $specDir `
  --add-data "${resourceFile};ai_humanizer\resources" `
  main.py
