import asyncio

import httpx
import pytest

import geocode as geocode_mod
import main
from geocode import GeocodeError
from helpers import join, make_trip

ITEMS = [
    {"lat": "12.3052", "lon": "76.6552", "name": "Mysore Palace",
     "display_name": "Mysore Palace, Mysuru, Karnataka, India"},
    {"lat": "12.3052", "lon": "76.6552", "name": "Mysore Palace",
     "display_name": "Mysore Palace, Mysuru, Karnataka, India"},
    {"lat": "12.31", "lon": "76.65",
     "display_name": "Mysuru Palace Gate, Mysuru, India"},
]


class FakeResponse:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self._payload = [] if payload is None else payload

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, response=None, error=None):
        self.response = response or FakeResponse(payload=ITEMS)
        self.error = error
        self.calls = []

    async def get(self, url, params=None):
        self.calls.append(params)
        if self.error:
            raise self.error
        return self.response


@pytest.fixture
def fake(monkeypatch):
    monkeypatch.setattr(geocode_mod, "MIN_GAP_S", 0)

    def install(**kwargs):
        client = FakeClient(**kwargs)
        monkeypatch.setattr(geocode_mod, "_client", client)
        return client

    return install


def search(q):
    return asyncio.run(geocode_mod.search_places(q))


def test_results_are_parsed_and_deduplicated(fake):
    fake()
    results = search("mysore palace")
    assert len(results) == 2
    assert results[0] == {
        "name": "Mysore Palace",
        "label": "Mysore Palace, Mysuru, Karnataka, India",
        "lat": 12.3052,
        "lng": 76.6552,
    }
    assert results[1]["name"] == "Mysuru Palace Gate"


def test_repeated_searches_are_cached(fake):
    client = fake()
    search("mysore palace")
    search("  MYSORE   palace ")
    assert len(client.calls) == 1


@pytest.mark.parametrize("status, reason", [(429, "busy"), (500, "unavailable")])
def test_service_errors_are_mapped(fake, status, reason):
    fake(response=FakeResponse(status=status))
    with pytest.raises(GeocodeError) as err:
        search("anywhere")
    assert err.value.reason == reason


def test_network_failure_is_reported(fake):
    fake(error=httpx.ConnectError("down"))
    with pytest.raises(GeocodeError) as err:
        search("anywhere")
    assert err.value.reason == "unavailable"


def test_malformed_results_are_reported(fake):
    fake(response=FakeResponse(payload=[{"display_name": "No coordinates"}]))
    with pytest.raises(GeocodeError) as err:
        search("anywhere")
    assert err.value.reason == "unavailable"


# ---------- the /geocode endpoint ----------

def params(code, member_id, q="mysore palace"):
    return {"q": q, "code": code, "member_id": member_id}


def test_only_the_owner_can_search(client, monkeypatch):
    async def fake_search(q):
        return [{"name": "X", "label": "X, Y", "lat": 1.0, "lng": 2.0}]

    monkeypatch.setattr(main, "search_places", fake_search)
    code, owner = make_trip(client)
    member = join(client, code, "B")

    ok = client.get("/geocode", params=params(code, owner))
    assert ok.status_code == 200
    assert ok.json()[0]["name"] == "X"
    assert client.get("/geocode", params=params(code, member)).status_code == 403
    assert client.get("/geocode", params=params(code, "nobody")).status_code == 403
    assert client.get("/geocode", params=params("ZZZZZZ", owner)).status_code == 404
    assert client.get("/geocode", params=params(code, owner, q="ab")).status_code == 422


@pytest.mark.parametrize("reason, status", [("busy", 429), ("unavailable", 503)])
def test_search_errors_become_http_errors(client, monkeypatch, reason, status):
    async def failing(q):
        raise GeocodeError(reason)

    monkeypatch.setattr(main, "search_places", failing)
    code, owner = make_trip(client)
    assert client.get("/geocode", params=params(code, owner)).status_code == status
