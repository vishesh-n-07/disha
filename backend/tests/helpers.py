ORIGIN = {"origin": "http://localhost:5173"}

LOC = {"type": "location", "lat": 12.97, "lng": 77.59, "accuracy": 10}
SOS = {"type": "sos", "lat": 12.97, "lng": 77.59, "accuracy": 10}
DEST = {"type": "destination", "lat": 12.2958, "lng": 76.6394, "name": "Mysore Palace"}


def make_trip(client, owner="Owner"):
    r = client.post("/trips", json={"trip_name": "Test trip", "owner_name": owner})
    assert r.status_code == 201
    data = r.json()
    return data["trip"]["code"], data["member_id"]


def join(client, code, name):
    r = client.post("/trips/join", json={"code": code, "name": name})
    assert r.status_code == 200
    return r.json()["member_id"]


def connect(client, code, member_id, origin=ORIGIN):
    return client.websocket_connect(f"/ws/{code}?member_id={member_id}", headers=dict(origin))


def hello(ws):
    """Read the two messages every connection starts with."""
    snap = ws.receive_json()
    dest = ws.receive_json()
    assert snap["type"] == "snapshot"
    assert dest["type"] == "destination"
    return snap, dest
