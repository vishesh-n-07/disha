import { useEffect, useState } from "react";
import { playSosSound } from "../sosSound";
import type { ConnStatus, Pos, SosEvent } from "../useTripLocations";

type Props = {
  status: ConnStatus;
  pos: Pos | null;
  mySos: SosEvent | null;
  pending: boolean;
  alerts: Record<string, SosEvent>;
  onSend: (pos: Pos | null) => void;
  onCancel: () => void;
  onAck: (id: string) => void;
};

const fmt = (ts: number) => new Date(ts * 1000).toLocaleTimeString();

export default function SosControls({
  status,
  pos,
  mySos,
  pending,
  alerts,
  onSend,
  onCancel,
  onAck,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const active = pending || mySos !== null;

  // Siren for incoming SOS alerts, repeating until acknowledged
  const unacked = Object.values(alerts).filter((a) => !acked[a.id]).length;
  useEffect(() => {
    if (unacked === 0) return;
    playSosSound();
    const id = setInterval(playSosSound, 5000);
    return () => clearInterval(id);
  }, [unacked]);

  return (
    <>
      <div className="sos-alerts">
        {Object.values(alerts).map((a) => (
          <div className="sos-alert" key={a.id}>
            <strong>SOS from {a.name}</strong> <span>{fmt(a.ts)}</span>
            <div>
              {a.location ? (
                <a
                  href={`https://www.google.com/maps?q=${a.location.lat},${a.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open their location in Maps
                </a>
              ) : (
                "Location unavailable"
              )}
            </div>
            <div className="sos-actions">
              <button
                disabled={acked[a.id]}
                onClick={() => {
                  setAcked((p) => ({ ...p, [a.id]: true }));
                  onAck(a.id);
                }}
              >
                {acked[a.id] ? "Acknowledged" : "I have seen this"}
              </button>
              <a className="call" href="tel:112">
                Call 112
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="sos-box">
        {!active && !confirming && (
          <button className="sos-btn" onClick={() => setConfirming(true)}>
            SOS
          </button>
        )}

        {!active && confirming && (
          <div className="sos-status">
            <strong>Send SOS?</strong>
            <p>
              Your latest location goes to everyone in this trip, even if location
              sharing is off.
            </p>
            {status !== "live" && (
              <p className="warn">
                No connection right now. It will be sent when the connection returns.
              </p>
            )}
            <div className="sos-actions">
              <button
                className="sos-send"
                onClick={() => {
                  onSend(pos);
                  setConfirming(false);
                }}
              >
                Send SOS
              </button>
              <button onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}

        {active && (
          <div className="sos-status">
            <strong>{mySos ? "SOS sent to the server" : "Sending SOS..."}</strong>
            {!mySos && (
              <p>
                {status === "live"
                  ? "Waiting for the server to confirm. Retrying automatically."
                  : "No connection. It will be sent as soon as the connection returns."}
              </p>
            )}
            {mySos &&
              (mySos.recipients === 0 ? (
                <p>No other members in this trip yet.</p>
              ) : (
                <p>
                  Delivered to {mySos.delivered} of {mySos.recipients} members. Seen
                  by {mySos.seen}.
                </p>
              ))}
            <p className="note">
              This alerts your trip members only. It does not contact emergency
              services.
            </p>
            <a className="call" href="tel:112">
              Call 112
            </a>
            {mySos && (
              <button
                className="secondary"
                onClick={onCancel}
                disabled={status !== "live"}
              >
                I am safe, cancel SOS
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

