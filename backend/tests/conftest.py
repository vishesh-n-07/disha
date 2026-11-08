import pytest
from fastapi.testclient import TestClient

import geocode as geocode_mod
import main


def _wipe():
    main.trips.clear()
    main.locations.clear()
    main.connections.clear()
    main.sos_events.clear()
    main.avatars.clear()
    mgr = main.routing_mgr
    mgr.routes.clear()
    mgr.fetched_at.clear()
    mgr.inflight.clear()
    mgr.calls.clear()
    geocode_mod._cache.clear()


@pytest.fixture(autouse=True)
def clean_state():
    _wipe()
    yield
    _wipe()


@pytest.fixture
def client():
    # The "with" keeps one event loop alive for the whole test, so several
    # WebSocket connections and background route tasks can talk to each other.
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def fake_routes(monkeypatch):
    """Replace the real routing service so tests never touch the network."""
    calls = []

    async def fake_fetch(loc, dest):
        calls.append((loc, dest))
        return {
            "coords": [[loc["lat"], loc["lng"]], [dest["lat"], dest["lng"]]],
            "distance_m": 1234,
            "duration_s": 300,
            "arrived": False,
        }

    monkeypatch.setattr(main.routing_mgr, "_fetch", fake_fetch)
    return calls
