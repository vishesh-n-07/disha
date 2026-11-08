import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Marker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import TripPanel from "./components/TripPanel";
import SosControls from "./components/SosControls";
import AvatarPicker from "./components/AvatarPicker";
import DestinationPanel from "./components/DestinationPanel";
import type { Session } from "./trip";
import { useTripLocations, type Pos } from "./useTripLocations";
import { memberIcon, destinationIcon } from "./memberIcon";
import { bearing, distanceM } from "./geo";

type LL = { lat: number; lng: number };

// Centres on me at first, then follows me unless the user has dragged the map away
function Follower({
  pos,
  follow,
  onUserMove,
}: {
  pos: Pos;
  follow: boolean;
  onUserMove: () => void;
}) {
  const map = useMap();
  const [centered, setCentered] = useState(false);
  useMapEvents({ dragstart: onUserMove });

  useEffect(() => {
    if (!centered) {
      map.setView([pos.lat, pos.lng], 16);
      setCentered(true);
    } else if (follow) {
      map.panTo([pos.lat, pos.lng]);
    }
  }, [pos.lat, pos.lng, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FlyTo({ target }: { target: (LL & { n: number }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 13));
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function ClickCatcher({
  active,
  onPick,
}: {
  active: boolean;
  onPick: (p: LL) => void;
}) {
  const map = useMap();
  useMapEvents({
    click(e) {
      if (active) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  useEffect(() => {
    map.getContainer().style.cursor = active ? "crosshair" : "";
  }, [active, map]);
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
  const [follow, setFollow] = useState(true);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<LL | null>(null);
  const [focus, setFocus] = useState<(LL & { n: number }) | null>(null);
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
    destination,
    sendDestination,
    clearDestination,
  } = useTripLocations(session, pos, sharing);

  // Direction of travel: use the device heading when available, otherwise
  // work it out from how far I have moved since the last reference point.
  const lastHeading = useRef<number | null>(null);
  const anchor = useRef<LL | null>(null);

  // Sharing always starts OFF for a new trip (explicit consent)
  function handleSession(s: Session | null) {
    setSession(s);
    if (!s) {
      setSharing(false);
      setPicking(false);
      setDraft(null);
      setFollow(true);
    }
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
  const isOwner = !!session && session.trip.owner_id === session.memberId;

  function saveDestination(name: string) {
    if (!draft) return;
    sendDestination({ ...draft, name: name.trim() || "Destination" });
    setPicking(false);
    setDraft(null);
  }

  function showDestination() {
    if (!destination) return;
    setFollow(false);
    setFocus({ lat: destination.lat, lng: destination.lng, n: Date.now() });
  }

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
        <ClickCatcher active={picking} onPick={setDraft} />
        <FlyTo target={focus} />
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
            <Follower pos={pos} follow={follow} onUserMove={() => setFollow(false)} />
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
        {session && destination && (
          <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
            <Tooltip permanent direction="top" offset={[0, -30]}>
              {destination.name}
            </Tooltip>
          </Marker>
        )}
        {picking && draft && (
          <Marker position={[draft.lat, draft.lng]} icon={destinationIcon} opacity={0.6} />
        )}
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
      {!follow && pos && (
        <button className="follow-btn" onClick={() => setFollow(true)}>
          Centre on me
        </button>
      )}
      {session && (
        <>
          <DestinationPanel
            isOwner={isOwner}
            destination={destination}
            myPos={pos}
            picking={picking}
            draft={draft}
            connected={status === "live"}
            onStartPick={() => {
              setDraft(null);
              setPicking(true);
            }}
            onCancelPick={() => {
              setPicking(false);
              setDraft(null);
            }}
            onSave={saveDestination}
            onClear={clearDestination}
            onShow={showDestination}
          />
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
