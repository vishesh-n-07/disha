import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Marker,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import TripPanel from "./components/TripPanel";
import SosControls from "./components/SosControls";
import AvatarPicker from "./components/AvatarPicker";
import type { Session } from "./trip";
import { useTripLocations, type Pos } from "./useTripLocations";
import { memberIcon } from "./memberIcon";
import { bearing, distanceM } from "./geo";

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
  const {
    locations,
    avatars,
    status,
    alerts,
    mySos,
    sosPending,
    sendSos,
    cancelSos,
    ackSos,
    sendAvatar,
  } = useTripLocations(session, pos, sharing);

  // Direction of travel: use the device heading when available, otherwise
  // work it out from how far I have moved since the last reference point.
  const lastHeading = useRef<number | null>(null);
  const anchor = useRef<{ lat: number; lng: number } | null>(null);

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
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        const acc = p.coords.accuracy;
        const h = p.coords.heading;
        if (typeof h === "number" && !Number.isNaN(h)) {
          lastHeading.current = h;
          anchor.current = here;
        } else if (!anchor.current) {
          anchor.current = here;
        } else if (distanceM(anchor.current, here) > Math.max(10, acc)) {
          lastHeading.current = bearing(anchor.current, here);
          anchor.current = here;
        }
        setPos({ ...here, accuracy: acc, heading: lastHeading.current });
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
            {session ? (
              <Marker
                position={[pos.lat, pos.lng]}
                icon={memberIcon({
                  name: me?.name ?? "You",
                  color: myColor,
                  avatar: avatars[session.memberId],
                  heading: pos.heading,
                })}
              >
                <Tooltip permanent direction="top" offset={[0, -24]}>
                  You
                </Tooltip>
              </Marker>
            ) : (
              <CircleMarker
                center={[pos.lat, pos.lng]}
                radius={10}
                pathOptions={{ color: myColor, fillOpacity: 0.9 }}
              >
                <Tooltip permanent direction="top" offset={[0, -10]}>
                  You
                </Tooltip>
              </CircleMarker>
            )}
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
                <Marker
                  key={id}
                  position={[loc.lat, loc.lng]}
                  icon={memberIcon({
                    name: m.name,
                    color: m.color,
                    avatar: avatars[id],
                    heading: loc.heading,
                  })}
                >
                  <Tooltip permanent direction="top" offset={[0, -24]}>
                    {m.name}
                  </Tooltip>
                </Marker>
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
        <>
          <AvatarPicker current={avatars[session.memberId]} onPick={sendAvatar} />
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
        </>
      )}
    </div>
  );
}
