import { useEffect, useRef, useState } from "react";
import type { Session } from "./trip";

export type Pos = { lat: number; lng: number; accuracy: number };
export type MemberLocation = Pos & { ts: number };
export type ConnStatus = "off" | "connecting" | "live" | "reconnecting";

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
  const wsRef = useRef<WebSocket | null>(null);
  const code = session?.trip.code;
  const memberId = session?.memberId;

  // Connection with automatic reconnect (backoff up to 10s)
  useEffect(() => {
    if (!code || !memberId) {
      setLocations({});
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

  return { locations, status };
}
