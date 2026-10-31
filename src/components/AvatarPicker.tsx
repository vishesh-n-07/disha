import { useRef, useState } from "react";

// Crop to a square, shrink to 96px and re-encode as JPEG.
// Re-encoding also removes hidden metadata (e.g. GPS tags) from the original photo.
async function toAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.75);
}

export default function AvatarPicker({
  current,
  onPick,
}: {
  current?: string;
  onPick: (dataUrl: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setError(null);
      onPick(await toAvatar(file));
    } catch {
      setError("Could not read that image. Try a JPG or PNG.");
    }
  }

  return (
    <div className="avatar-picker">
      {current && <img src={current} alt="Your photo" />}
      <div>
        <button onClick={() => input.current?.click()}>
          {current ? "Change photo" : "Add photo"}
        </button>
        <p className="note">Only members of this trip can see it.</p>
        {error && <p className="panel-error">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={handleFile} />
    </div>
  );
}
