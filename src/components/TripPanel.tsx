import { useEffect, useState } from "react";
import {
  ApiError,
  createTrip,
  joinTrip,
  fetchTrip,
  leaveTrip,
  type Session,
} from "../trip";

export default function TripPanel() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [session, setSession] = useState<Session | null>(null);
  const [tripName, setTripName] = useState("");
  const [yourName, setYourName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sessionCode = session?.trip.code;
  const memberId = session?.memberId;

  // Refresh the member list every 3s (WebSockets replace this in a later brick)
  useEffect(() => {
    if (!sessionCode || !memberId) return;
    const id = setInterval(async () => {
      try {
        const trip = await fetchTrip(sessionCode, memberId);
        setSession((s) => (s ? { ...s, trip } : s));
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          setSession(null);
          setError("This trip is no longer available.");
        } else {
          setError("Connection lost. Retrying...");
        }
      }
    }, 3000);
    return () => clearInterval(id);
  }, [sessionCode, memberId]);

  async function run(action: () => Promise<Session>) {
    setBusy(true);
    setError(null);
    try {
      setSession(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    run(() => createTrip(tripName, yourName));
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    run(() => joinTrip(joinCode, yourName));
  }

  async function copyCode() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.trip.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Could not copy. Please copy the code manually.");
    }
  }

  async function handleLeave() {
    if (!session) return;
    try {
      await leaveTrip(session.trip.code, session.memberId);
    } catch {
      /* leave locally even if the server is unreachable */
    }
    setSession(null);
    setTripName("");
    setJoinCode("");
  }

  const canCreate = tripName.trim() !== "" && yourName.trim() !== "";
  const canJoin = joinCode.trim().length === 6 && yourName.trim() !== "";

  return (
    <aside className="trip-panel">
      {!session ? (
        <>
          <div className="tabs">
            <button
              className={mode === "create" ? "active" : ""}
              onClick={() => setMode("create")}
            >
              Create
            </button>
            <button
              className={mode === "join" ? "active" : ""}
              onClick={() => setMode("join")}
            >
              Join
            </button>
          </div>

          {mode === "create" ? (
            <form onSubmit={handleCreate}>
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
              <button type="submit" disabled={!canCreate || busy}>
                {busy ? "Creating..." : "Create trip"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin}>
              <input
                placeholder="Invite code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <input
                placeholder="Your name"
                value={yourName}
                onChange={(e) => setYourName(e.target.value)}
                maxLength={30}
              />
              <button type="submit" disabled={!canJoin || busy}>
                {busy ? "Joining..." : "Join trip"}
              </button>
            </form>
          )}
        </>
      ) : (
        <div>
          <h2>{session.trip.name}</h2>
          <p className="label">Invite code</p>
          <div className="code-row">
            <code>{session.trip.code}</code>
            <button onClick={copyCode}>{copied ? "Copied!" : "Copy"}</button>
          </div>
          <p className="label">Members ({session.trip.members.length})</p>
          <ul>
            {session.trip.members.map((m) => (
              <li key={m.id}>
                <span className="dot" style={{ background: m.color }} />
                {m.name}
                {m.id === session.memberId && " (you)"}
              </li>
            ))}
          </ul>
          <button className="secondary" onClick={handleLeave}>
            Leave trip
          </button>
        </div>
      )}
      {error && <p className="panel-error">{error}</p>}
    </aside>
  );
}
