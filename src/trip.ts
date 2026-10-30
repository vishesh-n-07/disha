export type Member = { id: string; name: string; color: string };
export type Trip = { id: string; name: string; code: string; members: Member[] };
export type Session = { trip: Trip; memberId: string };

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is it running?");
  }
  if (!res.ok) {
    let detail = "Something went wrong";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else detail = "Please check the details you entered";
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export async function createTrip(tripName: string, ownerName: string): Promise<Session> {
  const data = await request<{ trip: Trip; member_id: string }>("/trips", {
    method: "POST",
    body: JSON.stringify({ trip_name: tripName, owner_name: ownerName }),
  });
  return { trip: data.trip, memberId: data.member_id };
}

export async function joinTrip(code: string, name: string): Promise<Session> {
  const data = await request<{ trip: Trip; member_id: string }>("/trips/join", {
    method: "POST",
    body: JSON.stringify({ code: code.trim().toUpperCase(), name }),
  });
  return { trip: data.trip, memberId: data.member_id };
}

export function fetchTrip(code: string, memberId: string): Promise<Trip> {
  return request<Trip>(`/trips/${code}?member_id=${encodeURIComponent(memberId)}`);
}

export function leaveTrip(code: string, memberId: string): Promise<void> {
  return request<void>(`/trips/${code}/members/${memberId}`, { method: "DELETE" });
}
