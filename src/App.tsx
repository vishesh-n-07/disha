import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import TripPanel from "./components/TripPanel";
import SosControls from "./components/SosControls";
import type { Session } from "./trip";
import { useTripLocations, type Pos } from "./useTripLocations";

function Recenter({ pos }: { pos: Pos }) {
  const map = useMap();
  const [centered, setCentered] = useState(false);

  useEffect(() => {
    if (!centered) {
      map.setView([pos.lat, pos.lng], 16);
      setCentered(true);
    } else {
      map.panTo([pos.lat, pos.lng]);
    }
  }, [pos.lat, pos.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const STATUS_LABEL = {
  off: "",
  connecting: "Connecting...",
  live: "Live",
  reconnecting: "Reconnecting...",
} as const;

export default function App() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sharing, setSharing] = useState(false);
  const { locations, status, alerts, mySos, sosPending, sendSos, cancelSos, ackSos } =
    useTripLocations(session, pos, sharing);

  // Sharing always starts OFF for a new trip (explicit consent)
  function handleSession(s: Session | null) {
    setSession(s);
    if (!s) setSharing(false);
  }

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        });
      },
      (e) => {
        const msgs: Record<number, string> = {
          1: "Location permission denied. Enable it in your browser settings.",
          2: "Location unavailable. Check GPS or connection.",
          3: "Location request timed out.",
        };
        setError(msgs[e.code] ?? "Unknown location error.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const me = session
    ? session.trip.members.find((m) => m.id === session.memberId)
    : undefined;
  const myColor = me?.color ?? "#1a73e8";

  return (
    <div className="app">
      <header>
        <span>DISHA</span>
        {session && <span className="status">{STATUS_LABEL[status]}</span>}
      </header>
      {error && <div className="error">{error}</div>}
      <MapContainer center={[12.9716, 77.5946]} zoom={15} className="map">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pos && (
          <>
            <Circle
              center={[pos.lat, pos.lng]}
              radius={pos.accuracy}
              pathOptions={{ color: myColor, fillOpacity: 0.1, weight: 1 }}
            />
            <CircleMarker
              center={[pos.lat, pos.lng]}
              radius={10}
              pathOptions={{ color: myColor, fillOpacity: 0.9 }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                You
              </Tooltip>
            </CircleMarker>
            <Recenter pos={pos} />
          </>
        )}
        {session &&
          Object.entries(locations)
            .filter(([id]) => id !== session.memberId)
            .map(([id, loc]) => {
              const m = session.trip.members.find((x) => x.id === id);
              if (!m) return null;
              return (
                <CircleMarker
                  key={id}
                  center={[loc.lat, loc.lng]}
                  radius={10}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: m.color,
                    fillOpacity: 1,
                  }}
                >
                  <Tooltip permanent direction="top" offset={[0, -10]}>
                    {m.name}
                  </Tooltip>
                </CircleMarker>
              );
            })}
        {Object.values(alerts).map(
          (a) =>
            a.location && (
              <CircleMarker
                key={a.id}
                center={[a.location.lat, a.location.lng]}
                radius={16}
                pathOptions={{
                  color: "#b71c1c",
                  weight: 3,
                  fillColor: "#e53935",
                  fillOpacity: 0.7,
                }}
              >
                <Tooltip permanent direction="bottom" offset={[0, 14]}>
                  SOS: {a.name}
                </Tooltip>
              </CircleMarker>
            )
        )}
      </MapContainer>
      <TripPanel
        onSession={handleSession}
        sharing={sharing}
        onSharingChange={setSharing}
      />
      {session && (
        <SosControls
          status={status}
          pos={pos}
          mySos={mySos}
          pending={sosPending}
          alerts={alerts}
          onSend={sendSos}
          onCancel={cancelSos}
          onAck={ackSos}
        />
      )}
    </div>
  );
}
