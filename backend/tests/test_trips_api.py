import re

import pytest

from helpers import join, make_trip

CODE = re.compile(r"^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$")


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_create_trip(client):
    r = client.post("/trips", json={"trip_name": "Coorg weekend", "owner_name": "Vishi"})
    assert r.status_code == 201
    data = r.json()
    trip = data["trip"]
    assert CODE.match(trip["code"])
    assert trip["name"] == "Coorg weekend"
    assert [m["name"] for m in trip["members"]] == ["Vishi"]
    assert trip["owner_id"] == data["member_id"] == trip["members"][0]["id"]
    assert trip["destination"] is None


def test_names_are_trimmed(client):
    r = client.post("/trips", json={"trip_name": "  Goa  ", "owner_name": "  Asha "})
    assert r.json()["trip"]["name"] == "Goa"
    assert r.json()["trip"]["members"][0]["name"] == "Asha"


@pytest.mark.parametrize(
    "body",
    [
        {"trip_name": "", "owner_name": "A"},
        {"trip_name": "   ", "owner_name": "A"},
        {"trip_name": "x" * 41, "owner_name": "A"},
        {"trip_name": "T", "owner_name": ""},
        {"trip_name": "T", "owner_name": "y" * 31},
        {"trip_name": "T"},
    ],
)
def test_create_trip_validation(client, body):
    assert client.post("/trips", json=body).status_code == 422


def test_invite_codes_are_unique(client):
    codes = {make_trip(client)[0] for _ in range(100)}
    assert len(codes) == 100


def test_join_adds_member_with_a_new_colour(client):
    code, _ = make_trip(client)
    r = client.post("/trips/join", json={"code": code, "name": "Murthy"})
    assert r.status_code == 200
    members = r.json()["trip"]["members"]
    assert [m["name"] for m in members] == ["Owner", "Murthy"]
    assert members[0]["color"] != members[1]["color"]


def test_join_code_is_case_insensitive(client):
    code, _ = make_trip(client)
    r = client.post("/trips/join", json={"code": code.lower(), "name": "A"})
    assert r.status_code == 200


def test_join_unknown_trip(client):
    r = client.post("/trips/join", json={"code": "ZZZZZZ", "name": "A"})
    assert r.status_code == 404


def test_join_rejects_wrong_code_length(client):
    assert client.post("/trips/join", json={"code": "ABC", "name": "A"}).status_code == 422


def test_trip_is_full_at_20_members(client):
    code, _ = make_trip(client)
    for i in range(19):
        join(client, code, f"M{i}")
    r = client.post("/trips/join", json={"code": code, "name": "Extra"})
    assert r.status_code == 409


def test_members_can_read_their_trip(client):
    code, owner = make_trip(client)
    r = client.get(f"/trips/{code}", params={"member_id": owner})
    assert r.status_code == 200
    assert r.json()["code"] == code


def test_non_members_cannot_read_a_trip(client):
    code, _ = make_trip(client)
    assert client.get(f"/trips/{code}", params={"member_id": "not-a-member"}).status_code == 403


def test_reading_an_unknown_trip_is_404(client):
    assert client.get("/trips/ZZZZZZ", params={"member_id": "x"}).status_code == 404


def test_member_id_is_required(client):
    code, _ = make_trip(client)
    assert client.get(f"/trips/{code}").status_code == 422


def test_leaving_removes_the_member(client):
    code, owner = make_trip(client)
    other = join(client, code, "B")
    assert client.delete(f"/trips/{code}/members/{other}").status_code == 204
    trip = client.get(f"/trips/{code}", params={"member_id": owner}).json()
    assert [m["id"] for m in trip["members"]] == [owner]
    # someone who left can no longer read the trip
    assert client.get(f"/trips/{code}", params={"member_id": other}).status_code == 403


def test_unknown_member_cannot_be_removed(client):
    code, _ = make_trip(client)
    assert client.delete(f"/trips/{code}/members/not-a-member").status_code == 403


def test_owner_leaving_hands_over_ownership(client):
    code, owner = make_trip(client)
    other = join(client, code, "B")
    client.delete(f"/trips/{code}/members/{owner}")
    trip = client.get(f"/trips/{code}", params={"member_id": other}).json()
    assert trip["owner_id"] == other


def test_last_member_leaving_deletes_the_trip(client):
    code, owner = make_trip(client)
    client.delete(f"/trips/{code}/members/{owner}")
    assert client.get(f"/trips/{code}", params={"member_id": owner}).status_code == 404
