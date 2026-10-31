import re
import secrets
import time
import uuid

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

app = FastAPI(title="DISHA API")

# Allow the Vite dev server (any localhost port) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 32 chars, no I/O/0/1
COLORS = ["#1a73e8", "#e8710a", "#188038", "#a142f4", "#d93025", "#00897b"]
MAX_MEMBERS = 20

# In-memory store for now (resets when the server restarts). PostgreSQL comes later.
trips: dict[str, dict] = {}


class CreateTripIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    trip_name: str = Field(min_length=1, max_length=40)
    owner_name: str = Field(min_length=1, max_length=30)


class JoinTripIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    code: str = Field(min_length=6, max_length=6)
    name: str = Field(min_length=1, max_length=30)


def new_code() -> str:
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(6))
        if code not in trips:
            return code


def make_member(trip: dict, name: str) -> dict:
    color = COLORS[len(trip["members"]) % len(COLORS)]
    return {"id": str(uuid.uuid4()), "name": name, "color": color}


def get_trip(code: str) -> dict:
    trip = trips.get(code.upper())
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def require_member(trip: dict, member_id: str) -> None:
    if not any(m["id"] == member_id for m in trip["members"]):
        raise HTTPException(status_code=403, detail="Not a member of this trip")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/trips", status_code=201)
def create_trip(body: CreateTripIn):
    trip = {
        "id": str(uuid.uuid4()),
        "name": body.trip_name,
        "code": new_code(),
        "members": [],
    }
    owner = make_member(trip, body.owner_name)
    trip["members"].append(owner)
    trips[trip["code"]] = trip
    return {"trip": trip, "member_id": owner["id"]}


@app.post("/trips/join")
def join_trip(body: JoinTripIn):
    trip = get_trip(body.code)
    if len(trip["members"]) >= MAX_MEMBERS:
        raise HTTPException(status_code=409, detail="Trip is full")
    member = make_member(trip, body.name)
    trip["members"].append(member)
    return {"trip": trip, "member_id": member["id"]}


@app.get("/trips/{code}")
def read_trip(code: str, member_id: str):
    trip = get_trip(code)
    require_member(trip, member_id)  # only members can see the trip
    return trip


@app.delete("/trips/{code}/members/{member_id}", status_code=204)
def leave_trip(code: str, member_id: str):
    trip = get_trip(code)
    require_member(trip, member_id)
    trip["members"] = [m for m in trip["members"] if m["id"] != member_id]
    if not trip["members"]:
        del trips[trip["code"]]  # empty trips are removed



# ---------- Live locations (WebSocket) ----------
locations: dict[str, dict[str, dict]] = {}       # trip code -> member_id -> latest location
connections: dict[str, dict[str, WebSocket]] = {}  # trip code -> member_id -> socket
WS_ORIGIN = re.compile(r"http://(localhost|127\.0\.0\.1):\d+")


async def broadcast(code: str, message: dict, exclude: str | None = None):
    for mid, sock in list(connections.get(code, {}).items()):
        if mid == exclude:
            continue
        try:
            await sock.send_json(message)
        except Exception:
            connections.get(code, {}).pop(mid, None)


def valid_location(d: dict) -> dict | None:
    try:
        lat = float(d["lat"])
        lng = float(d["lng"])
        acc = float(d.get("accuracy", 0))
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180 and 0 <= acc <= 100000):
        return None
    return {"lat": lat, "lng": lng, "accuracy": acc, "ts": time.time()}


@app.websocket("/ws/{code}")
async def trip_socket(ws: WebSocket, code: str, member_id: str):
    # Reject unknown origins and non-members before accepting the connection
    if not WS_ORIGIN.fullmatch(ws.headers.get("origin", "")):
        await ws.close(code=1008)
        return
    trip = trips.get(code.upper())
    if trip is None or not any(m["id"] == member_id for m in trip["members"]):
        await ws.close(code=1008)
        return

    await ws.accept()
    code = trip["code"]
    connections.setdefault(code, {})[member_id] = ws

    member_ids = {m["id"] for m in trip["members"]}
    snapshot = {
        mid: loc for mid, loc in locations.get(code, {}).items() if mid in member_ids
    }
    await ws.send_json({"type": "snapshot", "locations": snapshot})

    try:
        while True:
            data = await ws.receive_json()
            if not isinstance(data, dict):
                continue
            if data.get("type") == "location":
                loc = valid_location(data)
                if loc is None:
                    continue
                locations.setdefault(code, {})[member_id] = loc
                await broadcast(
                    code,
                    {"type": "location", "member_id": member_id, **loc},
                    exclude=member_id,
                )
            elif data.get("type") == "stop":
                locations.get(code, {}).pop(member_id, None)
                await broadcast(
                    code, {"type": "stop", "member_id": member_id}, exclude=member_id
                )
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        if connections.get(code, {}).get(member_id) is ws:
            del connections[code][member_id]
        locations.get(code, {}).pop(member_id, None)
        await broadcast(code, {"type": "stop", "member_id": member_id})
