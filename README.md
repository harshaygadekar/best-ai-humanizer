# AI Humanizer

Local Windows desktop application for AI-assisted text humanization. The app uses a native Qt widget shell, supports Gemini, Groq, and Ollama, stores non-secret settings locally, and persists API keys through Windows credential storage when `keyring` is installed.

## Features

- Single-window desktop workflow for paste, humanize, analyze, and copy
- Provider-aware model selection with `Gemini / ...`, `Groq / ...`, and `Ollama / ...` labels
- Temperature control from `0.1` to `1.0`
- Humanization toggles for smart typos, punctuation variation, organic repetition, and dynamic formatting
- Live local heuristics for AI-detection risk and human-likeness
- Optional provider-backed analysis after humanization or manual analyze
- Optional voice matching sample input
- Vintage Apple-inspired desktop styling

## Setup

```powershell
python -m pip install -r requirements.txt
python -m ai_humanizer
```

## Packaging

```powershell
.\build.ps1
```

This produces a portable one-folder build under a timestamped directory inside `release\`, for example `release\20260408-231500\AIHumanizer`.
