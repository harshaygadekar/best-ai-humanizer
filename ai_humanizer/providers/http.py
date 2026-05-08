from __future__ import annotations

import threading
from typing import Any

import requests


class ProviderHTTPError(RuntimeError):
    pass


_thread_local = threading.local()


def _session() -> requests.Session:
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        setattr(_thread_local, "session", session)
    return session


def request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    response = _session().request(
        method,
        url,
        headers=headers,
        params=params,
        json=json_body,
        timeout=timeout,
    )
    try:
        payload = response.json()
    except ValueError:
        payload = {"message": response.text.strip()}

    if not response.ok:
        message = payload.get("error", {}).get("message") or payload.get("message") or response.reason
        raise ProviderHTTPError(message)
    return payload
