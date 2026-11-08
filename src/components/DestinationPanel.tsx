import { useState } from "react";
import { distanceM } from "../geo";
import type { Place } from "../trip";
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
  onSearch: (q: string) => Promise<Place[]>;
  onPickPlace: (p: Place) => void;
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
  onSearch,
  onPickPlace,
}: Props) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const dist = destination && myPos ? distanceM(myPos, destination) : null;

  function resetSearch() {
    setQuery("");
    setResults(null);
    setSearchError(null);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3 || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await onSearch(q));
    } catch (err) {
      setResults(null);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <aside className="dest-panel">
      <h3>Destination</h3>

      {picking ? (
        <>
          <form className="search-row" onSubmit={handleSearch}>
            <input
              placeholder="Search a place"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
            />
            <button type="submit" disabled={searching || query.trim().length < 3}>
              {searching ? "..." : "Search"}
            </button>
          </form>
          {searchError && <p className="panel-error">{searchError}</p>}
          {results !== null && results.length === 0 && (
            <p className="note">No places found. Try adding the city or state.</p>
          )}
          {results !== null && results.length > 0 && (
            <ul className="place-results">
              {results.map((p, i) => (
                <li key={`${p.lat},${p.lng},${i}`}>
                  <button
                    onClick={() => {
                      onPickPlace(p);
                      setName(p.name);
                      setResults(null);
                      setQuery("");
                    }}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p>{draft ? "Check the name, then save." : "Or tap the map to place it."}</p>
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
                  resetSearch();
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
              resetSearch();
            }}
          >
            Cancel
          </button>
          <p className="note">Place search by OpenStreetMap Nominatim.</p>
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
