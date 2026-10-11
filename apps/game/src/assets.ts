import Phaser from "phaser";

interface Manifest {
  images?: Record<string, string>;
}

/** Fetches assets/manifest.json. Any failure (404, HTML fallback, bad JSON) means "no assets". */
export async function fetchManifest(): Promise<Manifest> {
  try {
    const res = await fetch("assets/manifest.json");
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return {};
    return (await res.json()) as Manifest;
  } catch {
    return {};
  }
}

/** An image if the texture loaded, else a colored rectangle of the same size. */
export function imageOrRect(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  w: number,
  h: number,
  color: number,
): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
  if (scene.textures.exists(key)) return scene.add.image(x, y, key).setDisplaySize(w, h);
  return scene.add.rectangle(x, y, w, h, color).setStrokeStyle(2, 0x000000, 0.6);
}
