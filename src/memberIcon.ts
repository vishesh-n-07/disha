import L from "leaflet";

const SAFE_AVATAR = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c];
  });
}

export function memberIcon(opts: {
  name: string;
  color: string;
  avatar?: string;
  heading?: number | null;
}) {
  const initial = esc((opts.name.trim()[0] ?? "?").toUpperCase());
  const photo =
    opts.avatar && SAFE_AVATAR.test(opts.avatar)
      ? `<img src="${opts.avatar}" alt="" />`
      : initial;
  const dir =
    opts.heading != null
      ? `<div class="pin-dir" style="transform:rotate(${Math.round(opts.heading)}deg)"></div>`
      : "";
  return L.divIcon({
    className: "pin-wrap",
    html: `<div class="pin" style="--c:${esc(opts.color)}">${dir}<div class="pin-photo">${photo}</div></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}
