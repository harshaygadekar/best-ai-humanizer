try:
    from ai_humanizer.app import run
except ImportError:  # pragma: no cover - safety fallback for unusual execution contexts
    from .app import run


if __name__ == "__main__":
    raise SystemExit(run())
