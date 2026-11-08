import base64

import pytest
from starlette.websockets import WebSocketDisconnect

import main
from helpers import DEST, LOC, SOS, connect, hello, join, make_trip
from routing import RoutingError


# ---------- access ----------

def test_unknown_member_is_rejected(client):
    code, _ = make_trip(client)
    with pytest.raises(WebSocketDisconnect):
        with connect(client, code, "not-a-member"):
            pass


def test_unknown_trip_is_rejected(client):
    with pytest.raises(WebSocketDisconnect):
        with connect(client, "ZZZZZZ", "x"):
            pass


@pytest.mark.parametrize(
    "origin",
    [{}, {"origin": "https://evil.example"}, {"origin": "http://localhost.evil.com:5173"}],
)
def test_unknown_origins_are_rejected(client, origin):
    code, owner = make_trip(client)
    with pytest.raises(WebSocketDisconnect):
        with connect(client, code, owner, origin=origin):
            pass


def test_connection_starts_with_snapshot_and_destination(client):
    code, owner = make_trip(client)
    with connect(client, code, owner) as ws:
        snap, dest = hello(ws)
        assert snap["locations"] == {}
        assert snap["avatars"] == {}
        assert dest["destination"] is None


# ---------- locations ----------

def test_locations_reach_the_same_trip_only(client):
    code_a, a1 = make_trip(client, "A1")
    a2 = join(client, code_a, "A2")
    code_b, b1 = make_trip(client, "B1")
    with connect(client, code_a, a1) as w1, connect(client, code_a, a2) as w2, connect(
        client, code_b, b1
    ) as wb:
        for w in (w1, w2, wb):
            hello(w)

        w1.send_json(LOC)
        msg = w2.receive_json()
        assert msg["type"] == "location"
        assert msg["member_id"] == a1
        assert msg["lat"] == LOC["lat"]

        # A1 does not get its own location back: its next message is A2's
        w2.send_json({**LOC, "lat": 13.0})
        assert w1.receive_json()["member_id"] == a2

        # The other trip saw nothing: its first message is its own SOS status
        wb.send_json({"type": "sos"})
        assert wb.receive_json()["type"] == "sos_status"


def test_invalid_locations_are_ignored(client):
    code, a1 = make_trip(client)
    a2 = join(client, code, "B")
    with connect(client, code, a1) as w1, connect(client, code, a2) as w2:
        hello(w1)
        hello(w2)
        w1.send_json({"type": "location", "lat": 999, "lng": 0, "accuracy": 5})
        w1.send_json({"type": "location", "lat": "abc", "lng": 0})
        w1.send_json({"type": "location", "lat": 12.9, "lng": 77.5, "accuracy": 10})
        assert w2.receive_json()["lat"] == 12.9


def test_stop_tells_the_others(client):
    code, a1 = make_trip(client)
    a2 = join(client, code, "B")
    with connect(client, code, a1) as w1, connect(client, code, a2) as w2:
        hello(w1)
        hello(w2)
        w1.send_json(LOC)
        w2.receive_json()
        w1.send_json({"type": "stop"})
        assert w2.receive_json() == {"type": "stop", "member_id": a1}


def test_late_joiner_gets_existing_locations(client):
    code, a1 = make_trip(client)
    a2 = join(client, code, "B")
    a3 = join(client, code, "C")
    with connect(client, code, a1) as w1, connect(client, code, a2) as w2:
        hello(w1)
        hello(w2)
        w1.send_json(LOC)
        w2.receive_json()  # proves the server stored it
        with connect(client, code, a3) as w3:
            snap, _ = hello(w3)
            assert snap["locations"][a1]["lat"] == LOC["lat"]


def test_disconnecting_removes_the_location(client):
    code, a1 = make_trip(client)
    a2 = join(client, code, "B")
    with connect(client, code, a2) as w2:
        hello(w2)
        with connect(client, code, a1) as w1:
            hello(w1)
            w1.send_json(LOC)
            w2.receive_json()
        assert w2.receive_json() == {"type": "stop", "member_id": a1}


# ---------- SOS ----------

def test_sos_goes_to_trip_members_with_honest_status(client):
    code, a1 = make_trip(client, "Asha")
    a2 = join(client, code, "Ben")
    with connect(client, code, a1) as w1, connect(client, code, a2) as w2:
        hello(w1)
        hello(w2)
        w1.send_json(SOS)

        alert = w2.receive_json()
        assert alert["type"] == "sos"
        assert alert["sos"]["name"] == "Asha"
        assert alert["sos"]["location"]["lat"] == SOS["lat"]

        status = w1.receive_json()["sos"]
        assert (status["recipients"], status["delivered"], status["seen"]) == (1, 1, 0)

        w2.send_json({"type": "sos_ack", "sos_id": alert["sos"]["id"]})
        assert w1.receive_json()["sos"]["seen"] == 1


def test_sos_retry_does_not_duplicate(client):
    code, a1 = make_trip(client)
    a2 = join(client, code, "B")
    with connect(client, code, a1) as w1, connect(client, code, a2) as w2:
        hello(w1)
        hello(w2)
        w1.send_json(SOS)
        assert w2.receive_json()["type"] == "sos"
        first = w1.receive_json()

        w1.send_json(SOS)  # a retry
        second = w1.receive_json()
        assert second["sos"]["id"] == first["sos"]["id"]

        w1.send_json(LOC)
        assert w2.receive_json()["type"] == "location"  # no second SOS in between


def test_only_the_sender_can_cancel_an_sos(client):
    code, a1 = make_trip(client)
    a2 = join(client, code, "B")
    with connect(client, code, a1) as w1, connect(client, code, a2) as w2:
        hello(w1)
        hello(w2)
        w1.send_json(SOS)
        sos_id = w2.receive_json()["sos"]["id"]
        w1.receive_json()

        w2.send_json({"type": "sos_cancel", "sos_id": sos_id})  # ignored
        w1.send_json(LOC)
        assert w2.receive_json()["type"] == "location"

        w1.send_json({"type": "sos_cancel", "sos_id": sos_id})
        for w in (w1, w2):
            assert w.receive_json() == {"type": "sos_resolved", "sos_id": sos_id}


def test_sos_with_nobody_else_reports_zero_recipients(client):
    code, a1 = make_trip(client)
    with connect(client, code, a1) as w1:
        hello(w1)
        w1.send_json(SOS)
        status = w1.receive_json()["sos"]
        assert status["recipients"] == 0
        assert status["delivered"] == 0


def test_member_who_connects_later_still_gets_the_sos(client):
    code, a1 = make_trip(client, "Asha")
    a2 = join(client, code, "Ben")
    with connect(client, code, a1) as w1:
        hello(w1)
        w1.send_json(SOS)
        assert w1.receive_json()["sos"]["delivered"] == 0  # Ben is offline
        with connect(client, code, a2) as w2:
            hello(w2)
            alert = w2.receive_json()
            assert alert["type"] == "sos"
            assert alert["sos"]["name"] == "Asha"
            assert w1.receive_json()["sos"]["delivered"] == 1


# ---------- destination ----------

def test_only_the_owner_can_set_the_destination(client):
    code, owner = make_trip(client)
    member = join(client, code, "B")
    with connect(client, code, owner) as wo, connect(client, code, member) as wm:
        hello(wo)
        hello(wm)
        wm.send_json({**DEST, "name": "Hacked"})  # ignored
        wo.send_json(DEST)
        msg = wm.receive_json()
        assert msg["type"] == "destination"
        assert msg["destination"]["name"] == "Mysore Palace"


def test_invalid_destination_is_ignored_and_names_are_cleaned(client):
    code, owner = make_trip(client)
    member = join(client, code, "B")
    with connect(client, code, owner) as wo, connect(client, code, member) as wm:
        hello(wo)
        hello(wm)
        wo.send_json({**DEST, "lat": 200})  # out of range
        wo.send_json({**DEST, "name": ""})
        assert wm.receive_json()["destination"]["name"] == "Destination"
        wo.send_json({**DEST, "name": "x" * 100})
        assert len(wm.receive_json()["destination"]["name"]) == 60


def test_destination_persists_and_can_be_cleared(client):
    code, owner = make_trip(client)
    late = join(client, code, "Late")
    with connect(client, code, owner) as wo:
        hello(wo)
        wo.send_json(DEST)
        wo.receive_json()  # the owner's own copy: proves it was stored
        with connect(client, code, late) as wl:
            _, dest = hello(wl)
            assert dest["destination"]["name"] == "Mysore Palace"
            wo.send_json({"type": "destination_clear"})
            assert wl.receive_json() == {"type": "destination", "destination": None}


# ---------- profile photos ----------

def jpeg_url(extra=20):
    return "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"x" * extra).decode()


def test_only_valid_small_jpegs_are_accepted(client):
    code, a1 = make_trip(client)
    a2 = join(client, code, "B")
    a3 = join(client, code, "C")
    good = jpeg_url()
    bad = [
        "data:image/png;base64," + base64.b64encode(b"\x89PNG....").decode(),
        "data:image/jpeg;base64," + base64.b64encode(b"not really a jpeg").decode(),
        "data:image/jpeg;base64,!!!not-base64!!!",
        jpeg_url(30000),  # too large
        12345,
    ]
    with connect(client, code, a1) as w1, connect(client, code, a2) as w2:
        hello(w1)
        hello(w2)
        for b in bad:
            w1.send_json({"type": "avatar", "avatar": b})
        w1.send_json({"type": "avatar", "avatar": good})
        assert w2.receive_json() == {"type": "avatar", "member_id": a1, "avatar": good}
        with connect(client, code, a3) as w3:
            snap, _ = hello(w3)
            assert snap["avatars"][a1] == good


# ---------- routes (routing service is faked) ----------

def test_route_is_sent_once_a_member_shares_location(client, fake_routes):
    code, owner = make_trip(client)
    with connect(client, code, owner) as wo:
        hello(wo)
        wo.send_json(DEST)
        assert wo.receive_json()["type"] == "destination"
        wo.send_json(LOC)
        msg = wo.receive_json()
        assert msg["type"] == "route"
        assert msg["member_id"] == owner
        assert msg["route"]["distance_m"] == 1234
        assert len(fake_routes) == 1


def test_arriving_is_reported_without_calling_the_service(client, fake_routes):
    code, owner = make_trip(client)
    with connect(client, code, owner) as wo:
        hello(wo)
        wo.send_json(DEST)
        wo.receive_json()
        wo.send_json({"type": "location", "lat": DEST["lat"], "lng": DEST["lng"], "accuracy": 5})
        assert wo.receive_json()["route"]["arrived"] is True
        assert fake_routes == []


def test_routing_failure_is_reported(client, monkeypatch):
    async def failing(loc, dest):
        raise RoutingError("unavailable")

    monkeypatch.setattr(main.routing_mgr, "_fetch", failing)
    code, owner = make_trip(client)
    with connect(client, code, owner) as wo:
        hello(wo)
        wo.send_json(DEST)
        wo.receive_json()
        wo.send_json(LOC)
        assert wo.receive_json() == {"type": "route_error", "reason": "unavailable"}


def test_stopping_sharing_removes_the_route(client, fake_routes):
    code, owner = make_trip(client)
    with connect(client, code, owner) as wo:
        hello(wo)
        wo.send_json(DEST)
        wo.receive_json()
        wo.send_json(LOC)
        wo.receive_json()
        wo.send_json({"type": "stop"})
        assert wo.receive_json() == {"type": "route", "member_id": owner, "route": None}


def test_late_joiner_gets_existing_routes(client, fake_routes):
    code, owner = make_trip(client)
    late = join(client, code, "Late")
    with connect(client, code, owner) as wo:
        hello(wo)
        wo.send_json(DEST)
        wo.receive_json()
        wo.send_json(LOC)
        wo.receive_json()
        with connect(client, code, late) as wl:
            hello(wl)
            msg = wl.receive_json()
            assert msg["type"] == "route"
            assert msg["member_id"] == owner
