$ErrorActionPreference = "Stop"

python -m PyInstaller `
  --noconfirm `
  --clean `
  --name AIHumanizer `
  --windowed `
  --add-data "ai_humanizer\resources\system-prompt-example1.md;ai_humanizer\resources" `
  ai_humanizer\__main__.py
