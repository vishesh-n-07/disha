import { useState } from "react";
import { createTrip, type Trip } from "../trip";

export default function TripPanel() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripName, setTripName] = useState("");
  const [yourName, setYourName] = useState("");
  const [copied, setCopied] = useState(false);

  const canCreate = tripName.trim() !== "" && yourName.trim() !== "";

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setTrip(createTrip(tripName, yourName));
  }

  async function copyCode() {
    if (!trip) return;
    try {
      await navigator.clipboard.writeText(trip.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Could not copy. Please copy the code manually.");
    }
  }

  function endTrip() {
    setTrip(null);
    setTripName("");
  }

  return (
    <aside className="trip-panel">
      {!trip ? (
        <form onSubmit={handleCreate}>
          <h2>Create a trip</h2>
          <input
            placeholder="Trip name (e.g. Coorg weekend)"
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            maxLength={40}
          />
          <input
            placeholder="Your name"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            maxLength={30}
          />
          <button type="submit" disabled={!canCreate}>
            Create trip
          </button>
        </form>
      ) : (
        <div>
          <h2>{trip.name}</h2>
          <p className="label">Invite code</p>
          <div className="code-row">
            <code>{trip.code}</code>
            <button onClick={copyCode}>{copied ? "Copied!" : "Copy"}</button>
          </div>
          <p className="label">Members ({trip.members.length})</p>
          <ul>
            {trip.members.map((m) => (
              <li key={m.id}>
                <span className="dot" style={{ background: m.color }} />
                {m.name}
              </li>
            ))}
          </ul>
          <button className="secondary" onClick={endTrip}>
            End trip
          </button>
        </div>
      )}
    </aside>
  );
}
