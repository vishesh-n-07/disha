import { useEffect, useRef, useState } from "react";
import type { Session } from "./trip";

export type Pos = { lat: number; lng: number; accuracy: number };
export type MemberLocation = Pos & { ts: number };
export type ConnStatus = "off" | "connecting" | "live" | "reconnecting";
export type SosEvent = {
  id: string;
  member_id: string;
  name: string;
  location: MemberLocation | null;
  ts: number;
  resolved: boolean;
  recipients: number;
  delivered: number;
  seen: number;
};

const WS_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(
  /^http/,
  "ws"
);

export function useTripLocations(
  session: Session | null,
  myPos: Pos | null,
  sharing: boolean
) {
  const [locations, setLocations] = useState<Record<string, MemberLocation>>({});
  const [status, setStatus] = useState<ConnStatus>("off");
  const [alerts, setAlerts] = useState<Record<string, SosEvent>>({});
  const [mySos, setMySos] = useState<SosEvent | null>(null);
  const [sosPending, setSosPending] = useState(false);
  const wantSos = useRef<{ pos: Pos | null } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const code = session?.trip.code;
  const memberId = session?.memberId;

  // Connection with automatic reconnect (backoff up to 10s)
  useEffect(() => {
    if (!code || !memberId) {
      setLocations({});
      setAlerts({});
      setMySos(null);
      setSosPending(false);
      wantSos.current = null;
      setStatus("off");
      return;
    }
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      const ws = new WebSocket(
        `${WS_BASE}/ws/${code}?member_id=${encodeURIComponent(memberId)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus("live");
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "snapshot") {
          setLocations(msg.locations);
        } else if (msg.type === "location") {
          setLocations((prev) => ({
            ...prev,
            [msg.member_id]: {
              lat: msg.lat,
              lng: msg.lng,
              accuracy: msg.accuracy,
              ts: msg.ts,
            },
          }));
        } else if (msg.type === "stop") {
          setLocations((prev) => {
            const next = { ...prev };
            delete next[msg.member_id];
            return next;
          });
        } else if (msg.type === "sos") {
          setAlerts((prev) => ({ ...prev, [msg.sos.id]: msg.sos }));
        } else if (msg.type === "sos_status") {
          setMySos(msg.sos);
          wantSos.current = null;
          setSosPending(false);
        } else if (msg.type === "sos_resolved") {
          setAlerts((prev) => {
            const next = { ...prev };
            delete next[msg.sos_id];
            return next;
          });
          setMySos((prev) => (prev && prev.id === msg.sos_id ? null : prev));
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus("reconnecting");
        attempt += 1;
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt, 10000));
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [code, memberId]);

  // Send my position only while sharing is switched on
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (sharing && myPos) {
      ws.send(JSON.stringify({ type: "location", ...myPos }));
    } else if (!sharing) {
      ws.send(JSON.stringify({ type: "stop" }));
    }
  }, [myPos, sharing, status]);

  // SOS delivery: send now, retry every 3s until the server confirms.
  // Safe to repeat: the server keeps one active SOS per member.
  useEffect(() => {
    if (!sosPending) return;
    const send = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && wantSos.current) {
        ws.send(JSON.stringify({ type: "sos", ...(wantSos.current.pos ?? {}) }));
      }
    };
    send();
    const id = setInterval(send, 3000);
    return () => clearInterval(id);
  }, [sosPending, status]);

  function sendSos(pos: Pos | null) {
    wantSos.current = { pos };
    setSosPending(true);
  }

  function cancelSos() {
    const ws = wsRef.current;
    if (mySos && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "sos_cancel", sos_id: mySos.id }));
    }
  }

  function ackSos(id: string) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "sos_ack", sos_id: id }));
    }
  }

  return { locations, status, alerts, mySos, sosPending, sendSos, cancelSos, ackSos };
}
