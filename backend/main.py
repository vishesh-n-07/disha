import secrets
import uuid

from fastapi import FastAPI, HTTPException
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
