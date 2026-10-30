export type Member = { id: string; name: string; color: string };
export type Trip = { id: string; name: string; code: string; members: Member[] };

// No I/O/0/1, so codes are easy to read out loud or type on a phone (32 chars)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const COLORS = ["#1a73e8", "#e8710a", "#188038", "#a142f4", "#d93025", "#00897b"];

export function createTrip(tripName: string, ownerName: string): Trip {
  return {
    id: crypto.randomUUID(),
    name: tripName.trim(),
    code: generateInviteCode(),
    members: [
      { id: crypto.randomUUID(), name: ownerName.trim(), color: COLORS[0] },
    ],
  };
}
