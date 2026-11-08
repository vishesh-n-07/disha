import { useState } from "react";
import { distanceM } from "../geo";
import type { Destination, Pos } from "../useTripLocations";

type Props = {
  isOwner: boolean;
  destination: Destination | null;
  myPos: Pos | null;
  picking: boolean;
  draft: { lat: number; lng: number } | null;
  connected: boolean;
  onStartPick: () => void;
  onCancelPick: () => void;
  onSave: (name: string) => void;
  onClear: () => void;
  onShow: () => void;
};

function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export default function DestinationPanel({
  isOwner,
  destination,
  myPos,
  picking,
  draft,
  connected,
  onStartPick,
  onCancelPick,
  onSave,
  onClear,
  onShow,
}: Props) {
  const [name, setName] = useState("");
  const dist = destination && myPos ? distanceM(myPos, destination) : null;

  return (
    <aside className="dest-panel">
      <h3>Destination</h3>

      {picking ? (
        <>
          <p>{draft ? "Name it, then save." : "Tap the map to place the destination."}</p>
          {draft && (
            <>
              <input
                placeholder="Name (e.g. Mysore Palace)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
              <button
                disabled={!connected}
                onClick={() => {
                  onSave(name);
                  setName("");
                }}
              >
                {connected ? "Save" : "Reconnecting..."}
              </button>
            </>
          )}
          <button
            className="secondary"
            onClick={() => {
              onCancelPick();
              setName("");
            }}
          >
            Cancel
          </button>
        </>
      ) : destination ? (
        <>
          <p className="dest-name">{destination.name}</p>
          {dist !== null && (
            <p className="note">{fmtDist(dist)} away in a straight line</p>
          )}
          <div className="dest-actions">
            <button onClick={onShow}>Show on map</button>
            <a
              className="call"
              href={`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Directions
            </a>
          </div>
          {isOwner && (
            <div className="dest-actions">
              <button onClick={onStartPick}>Change</button>
              <button onClick={onClear} disabled={!connected}>
                Clear
              </button>
            </div>
          )}
        </>
      ) : isOwner ? (
        <>
          <p>No destination yet.</p>
          <button onClick={onStartPick}>Set destination</button>
        </>
      ) : (
        <p>The trip creator has not set a destination yet.</p>
      )}
    </aside>
  );
}
