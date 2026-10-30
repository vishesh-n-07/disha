import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import TripPanel from "./components/TripPanel";

type Pos = { lat: number; lng: number; accuracy: number };

function Recenter({ pos }: { pos: Pos }) {
  const map = useMap();
  const [centered, setCentered] = useState(false);

  useEffect(() => {
    if (!centered) {
      map.setView([pos.lat, pos.lng], 16); // zoom in on the first fix only
      setCentered(true);
    } else {
      map.panTo([pos.lat, pos.lng]); // later updates just pan
    }
  }, [pos.lat, pos.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function App() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="app">
      <header>DISHA</header>
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
              pathOptions={{ color: "#1a73e8", fillOpacity: 0.1, weight: 1 }}
            />
            <CircleMarker
              center={[pos.lat, pos.lng]}
              radius={10}
              pathOptions={{ color: "#1a73e8", fillOpacity: 0.9 }}
            />
            <Recenter pos={pos} />
          </>
        )}
      </MapContainer>
      <TripPanel />
    </div>
  );
}
