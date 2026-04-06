from __future__ import annotations

from typing import Any

import requests


class ProviderHTTPError(RuntimeError):
    pass


def request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    response = requests.request(
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
