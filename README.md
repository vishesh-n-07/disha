# DISHA

**Direction.** A group mobility and personal-safety app: a shared live map for trip groups, with an SOS alert that goes **only to members of the same trip**.

> **Status:** working prototype (browser-based). Not production-ready. See "Known limitations" below.

## What works today

- Interactive map (Leaflet + OpenStreetMap) with your live location and an accuracy circle
- Create a trip and share a 6-character invite code
- Join a trip with the code; the member list updates live
- Real-time member locations over WebSockets, shown as named, colour-coded markers
- Location sharing is **opt-in** and can be switched off at any time
- **SOS to trip members only**, with:
  - a confirm step to prevent accidental alerts
  - honest delivery status: sent to server, delivered to X of N, seen by Y
  - automatic retry until the server confirms
  - a red map marker and banner for recipients, plus a siren until they acknowledge
  - a "Call 112" link and a clear note that SOS does not contact emergency services

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React, TypeScript, Vite, Leaflet |
| Backend | Python, FastAPI, Uvicorn |
| Real-time | WebSockets |
| Storage | In-memory (PostgreSQL + PostGIS planned) |

## Architecture

    Browser (React)                      FastAPI server
    +-----------------------+  REST   +---------------------------+
    | TripPanel             |-------->| POST /trips               |
    |  create/join/leave    |         | POST /trips/join          |
    |                       |         | GET /trips/{code}         |
    | useTripLocations      |  WS     | DELETE /trips/{code}/...  |
    |  locations, SOS,      |<------->| WS /ws/{code}             |
    |  auto-reconnect       |         |  membership check,        |
    |                       |         |  per-trip broadcast       |
    | SosControls + map     |         +---------------------------+
    +-----------------------+

### WebSocket messages

| Direction | Type | Purpose |
|-----------|------|---------|
| client to server | `location`, `stop` | Share or stop sharing my position |
| client to server | `sos`, `sos_cancel` | Raise or cancel my SOS |
| client to server | `sos_ack` | Mark another member's SOS as seen |
| server to client | `snapshot`, `location`, `stop` | Member positions |
| server to client | `sos`, `sos_status`, `sos_resolved` | Alert to others, delivery status to sender, cancellation |

## Run locally

Requirements: Node.js 18+, Python 3.10+

Backend (terminal 1):

    cd backend
    python -m venv .venv
    .venv/Scripts/python -m pip install -r requirements.txt
    .venv/Scripts/python -m uvicorn main:app --reload --port 8000

On macOS/Linux, use `.venv/bin/python` instead of `.venv/Scripts/python`.
API docs: http://localhost:8000/docs

Frontend (terminal 2):

    npm install
    npm run dev

Open http://localhost:5173. To test with two people on one laptop, open a second window and set a different location in Chrome DevTools: Sensors, then Location.

## Privacy and safety design

- Location sharing is **off by default** for every new trip and can be stopped at any time.
- Only trip members can read a trip or receive its locations and alerts; the server checks membership on every request and WebSocket connection.
- WebSocket connections from unknown origins are rejected.
- Invite codes are generated with a cryptographically secure source (`secrets`) from an unambiguous 32-character alphabet.
- Input is validated on the server (name lengths, coordinate ranges, member limits).
- SOS sends the sender's latest location even if sharing is off; the confirm dialog says so.
- SOS never claims that help is on the way. It reports exactly what was delivered and seen.

## Known limitations

- **Alerts only reach members who have the app open.** Reliable delivery to closed apps needs push notifications (planned for the Android phase).
- Data is stored in memory and is lost when the server restarts.
- Your session is lost on page refresh.
- No authentication yet beyond trip membership; no rate limiting on joining.
- The SOS location is a snapshot from the moment of sending.
- Browser GPS accuracy varies. Laptops often locate by Wi-Fi or IP and can be off by hundreds of metres.
- Not deployed; phones need HTTPS to share location, so real-device testing comes after deployment.

## Roadmap

- [x] Map with live location and accuracy circle
- [x] Create trip and invite code
- [x] Join trip via invite code
- [x] Real-time multi-user locations (FastAPI + WebSockets)
- [x] SOS to trip members with delivery status, acknowledgement and retry
- [x] Photo and direction pins
- [ ] Automated tests (backend API and WebSocket flows)
- [ ] Persist sessions across refresh
- [ ] PostgreSQL + PostGIS storage
- [ ] Group separation alerts (configurable distance)
- [ ] Person-to-person navigation
- [ ] Authentication and rate limiting
- [ ] Deployment over HTTPS and real-device testing
- [ ] Push notifications and a native Android app

## Competitor note

Google Maps, Apple Find My and Life360 already offer live location sharing. DISHA's focus is the trip-centred workflow: temporary groups, honest SOS delivery status, and separation alerts, with privacy as a design constraint. Any claim of differentiation still needs validation with real users.

