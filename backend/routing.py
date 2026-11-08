import asyncio
import math
import os
import time
from collections import deque
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
MIN_INTERVAL_S = 30    # minimum gap between route fetches per member
MAX_AGE_S = 90         # refresh even when on route after this long
OFF_ROUTE_M = 120      # refresh sooner if this far from the route
ARRIVED_M = 60         # closer than this counts as arrived
GLOBAL_PER_MIN = 30    # stay under the free tier limit (40/min)


class RoutingError(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def dist_m(a: dict, b: dict) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp = p2 - p1
    dl = math.radians(b["lng"] - a["lng"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def dist_to_route_m(p: dict, coords: list) -> float:
    k = 111320.0
    c = math.cos(math.radians(p["lat"]))
    pts = [((lng - p["lng"]) * k * c, (lat - p["lat"]) * k) for lat, lng in coords]
    best = float("inf")
    for i in range(len(pts) - 1):
        ax, ay = pts[i]
        bx, by = pts[i + 1]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else max(0.0, min(1.0, (-ax * dx - ay * dy) / seg2))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def simplify(points: list, tol_m: float = 20.0) -> list:
    """Douglas-Peucker: keeps the route shape with far fewer points."""
    if len(points) < 3:
        return points
    k = 111320.0
    c = math.cos(math.radians(points[0][0]))
    xy = [(lng * k * c, lat * k) for lat, lng in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = xy[a]
        bx, by = xy[b]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = xy[i]
            if seg2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > best:
                best, bi = d, i
        if bi != -1 and best > tol_m:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, kp in zip(points, keep) if kp]


class RouteManager:
    def __init__(self, emit, get_location):
        self.emit = emit                  # async fn(code, message)
        self.get_location = get_location  # fn(code, member_id) -> location dict or None
        self.routes: dict[str, dict[str, dict]] = {}
        self.fetched_at: dict[tuple, float] = {}
        self.inflight: set[tuple] = set()
        self.calls: deque = deque()
        self.tasks: set = set()
        self.client = httpx.AsyncClient(timeout=10)

    def _spawn(self, coro):
        t = asyncio.create_task(coro)
        self.tasks.add(t)
        t.add_done_callback(self.tasks.discard)

    def snapshot(self, code: str) -> dict:
        return dict(self.routes.get(code, {}))

    def clear_member(self, code: str, member_id: str):
        had = self.routes.get(code, {}).pop(member_id, None)
        self.fetched_at.pop((code, member_id), None)
        if had is not None:
            self._spawn(
                self.emit(code, {"type": "route", "member_id": member_id, "route": None})
            )

    def on_destination_changed(self, code: str, trip: dict):
        self.routes.pop(code, None)
        for key in [k for k in self.fetched_at if k[0] == code]:
            del self.fetched_at[key]
        for m in trip["members"]:
            self.schedule(code, trip, m["id"])

    def _needs_refresh(self, code, member_id, loc, dest) -> bool:
        now = time.time()
        age = now - self.fetched_at.get((code, member_id), 0)
        if age < MIN_INTERVAL_S:
            return False
        route = self.routes.get(code, {}).get(member_id)
        if route is None:
            return True
        if route.get("arrived"):
            return dist_m(loc, dest) > ARRIVED_M * 2
        if age > MAX_AGE_S or len(route["coords"]) < 2:
            return True
        return dist_to_route_m(loc, route["coords"]) > OFF_ROUTE_M

    def schedule(self, code: str, trip: dict, member_id: str):
        dest = trip.get("destination")
        loc = self.get_location(code, member_id)
        if not dest or not loc:
            return
        key = (code, member_id)
        if key in self.inflight or not self._needs_refresh(code, member_id, loc, dest):
            return
        self.inflight.add(key)
        self._spawn(self._update(code, trip, member_id))

    async def _fetch(self, loc: dict, dest: dict) -> dict:
        key = os.getenv("ORS_API_KEY", "").strip()
        if not key:
            raise RoutingError("not_configured")
        now = time.time()
        while self.calls and now - self.calls[0] > 60:
            self.calls.popleft()
        if len(self.calls) >= GLOBAL_PER_MIN:
            raise RoutingError("busy")
        self.calls.append(now)
        try:
            r = await self.client.post(
                ORS_URL,
                headers={"Authorization": key, "Content-Type": "application/json"},
                json={
                    "coordinates": [[loc["lng"], loc["lat"]], [dest["lng"], dest["lat"]]],
                    "radiuses": [-1, -1],
                },
            )
        except httpx.HTTPError:
            raise RoutingError("unavailable")
        if r.status_code in (401, 403):
            raise RoutingError("bad_key")
        if r.status_code == 429:
            raise RoutingError("busy")
        if r.status_code in (400, 404):
            raise RoutingError("no_route")
        if r.status_code != 200:
            raise RoutingError("unavailable")
        try:
            feat = r.json()["features"][0]
            pts = [[lat, lng] for lng, lat in feat["geometry"]["coordinates"]]
            summ = feat["properties"]["summary"]
            dist, dur = float(summ["distance"]), float(summ["duration"])
        except (KeyError, IndexError, ValueError, TypeError):
            raise RoutingError("unavailable")
        pts = await asyncio.to_thread(simplify, pts, 20.0)
        return {
            "coords": [[round(a, 5), round(b, 5)] for a, b in pts],
            "distance_m": round(dist),
            "duration_s": round(dur),
            "arrived": False,
        }

    async def _update(self, code: str, trip: dict, member_id: str):
        key = (code, member_id)
        try:
            dest = trip.get("destination")
            loc = self.get_location(code, member_id)
            if not dest or not loc:
                return
            self.fetched_at[key] = time.time()
            if dist_m(loc, dest) <= ARRIVED_M:
                route = {"coords": [], "distance_m": 0, "duration_s": 0, "arrived": True}
            else:
                route = await self._fetch(loc, dest)
            # The situation may have changed while we waited for the service
            cur = trip.get("destination")
            if not cur or cur["lat"] != dest["lat"] or cur["lng"] != dest["lng"]:
                return
            if self.get_location(code, member_id) is None:
                return
            self.routes.setdefault(code, {})[member_id] = route
            await self.emit(code, {"type": "route", "member_id": member_id, "route": route})
        except RoutingError as e:
            await self.emit(code, {"type": "route_error", "reason": e.reason})
        finally:
            self.inflight.discard(key)
