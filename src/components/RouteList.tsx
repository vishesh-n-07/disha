import type { Member } from "../trip";
import type { Route } from "../useTripLocations";

const ERRORS: Record<string, string> = {
  not_configured: "Road routes are not set up on the server.",
  bad_key: "The routing key was rejected by the service.",
  busy: "Too many route requests. Retrying shortly.",
  no_route: "No road route found for some members.",
  unavailable: "Routing service unavailable right now.",
};

function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function fmtEta(s: number) {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

type Props = {
  members: Member[];
  meId: string;
  sharing: boolean;
  locations: Record<string, unknown>;
  routes: Record<string, Route>;
  routeError: string | null;
};

export default function RouteList({
  members,
  meId,
  sharing,
  locations,
  routes,
  routeError,
}: Props) {
  return (
    <aside className="route-list">
      <h3>Routes</h3>
      {members.map((m) => {
        const r = routes[m.id];
        const isSharing = m.id === meId ? sharing : !!locations[m.id];
        let text: string;
        if (r?.arrived) text = "Arrived";
        else if (r) text = `${fmtDist(r.distance_m)} · ${fmtEta(r.duration_s)}`;
        else if (!isSharing) text = "Not sharing location";
        else text = routeError ? "No route" : "Calculating...";
        return (
          <div className="route-row" key={m.id}>
            <span className="dot" style={{ background: m.color }} />
            <span>
              {m.name}
              {m.id === meId && " (you)"}
            </span>
            <span className="meta">{text}</span>
          </div>
        );
      })}
      {routeError && <p className="panel-error">{ERRORS[routeError] ?? "Route problem."}</p>}
      <p className="note">Driving estimates, without live traffic.</p>
    </aside>
  );
}
