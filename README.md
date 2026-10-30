# DISHA

Group mobility and personal-safety platform: a shared live map for trip groups,
with an SOS alert that goes only to members of the same trip.

> Status: early prototype (Brick 1 of the MVP)

## What works now
- Interactive map (Leaflet + OpenStreetMap)
- Live user location via the Browser Geolocation API
- Accuracy circle and handled permission/failure errors

## Roadmap (MVP)
- [x] Map + live location
- [x] Create Trip
- [x] Join trip via invite code
- [ ] Real-time multi-user locations (FastAPI + WebSockets)
- [ ] SOS to trip members with delivery status and retries
- [ ] Tests, deployment, architecture doc

## Run locally
    npm install
    npm run dev

## Design principles
- Explicit consent for location sharing; easy to stop at any time
- Location visible only to members of the same trip
- SOS never claims guaranteed help; it shows honest delivery status

