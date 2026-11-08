import asyncio
import time

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "DISHA/0.1 (student project; https://github.com/vishesh-n-07/disha)"
MIN_GAP_S = 1.1          # public Nominatim allows 1 request/second for the whole app
CACHE_TTL_S = 24 * 3600
CACHE_MAX = 500
MAX_WAITING = 3


class GeocodeError(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


_cache: dict[str, tuple[float, list]] = {}
_lock = asyncio.Lock()
_last_call = 0.0
_waiting = 0
_client = httpx.AsyncClient(timeout=10, headers={"User-Agent": USER_AGENT})


async def search_places(q: str) -> list[dict]:
    global _last_call, _waiting
    key = " ".join(q.lower().split())
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL_S:
        return hit[1]

    if _waiting >= MAX_WAITING:
        raise GeocodeError("busy")
    _waiting += 1
    try:
        async with _lock:
            wait = MIN_GAP_S - (time.time() - _last_call)
            if wait > 0:
                await asyncio.sleep(wait)
            _last_call = time.time()
            try:
                r = await _client.get(
                    NOMINATIM_URL,
                    params={"q": q, "format": "jsonv2", "limit": 5, "accept-language": "en"},
                )
            except httpx.HTTPError:
                raise GeocodeError("unavailable")
    finally:
        _waiting -= 1

    if r.status_code == 429:
        raise GeocodeError("busy")
    if r.status_code != 200:
        raise GeocodeError("unavailable")
    try:
        results = []
        for it in r.json():
            label = str(it.get("display_name", ""))[:160]
            name = (str(it.get("name") or "") or label.split(",")[0]).strip()[:60]
            results.append(
                {
                    "name": name or "Destination",
                    "label": label,
                    "lat": float(it["lat"]),
                    "lng": float(it["lon"]),
                }
            )
    except (ValueError, KeyError, TypeError):
        raise GeocodeError("unavailable")

    seen = set()
    unique = []
    for p in results:
        if p["label"] not in seen:
            seen.add(p["label"])
            unique.append(p)
    results = unique

    if len(_cache) >= CACHE_MAX:
        _cache.pop(next(iter(_cache)))
    _cache[key] = (time.time(), results)
    return results

