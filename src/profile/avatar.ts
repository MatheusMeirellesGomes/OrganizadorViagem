/*
 * Profile photo (Etapa 16): only JPEG, PNG or WebP, checked by their first
 * bytes; cropped to a square, resized and compressed in the browser before
 * being stored, so the original file never leaves the device.
 */

export const avatarTypes = ["image/jpeg", "image/png", "image/webp"];
export const avatarInputLimit = 10 * 1024 * 1024;
export const avatarSize = 320;
export const avatarMaxBytes = 120 * 1024;

export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | undefined {
  const s = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (s(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return "image/webp";
}

/** Rejects other types, empty or huge files, and files whose content does not match the type. */
export async function checkAvatarFile(file: Blob): Promise<void> {
  if (!avatarTypes.includes(file.type)) throw new Error("Escolha uma foto em JPG, PNG ou WebP.");
  if (!file.size || file.size > avatarInputLimit) throw new Error("A foto precisa ter até 10 MB.");
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (sniffImage(head) !== file.type) throw new Error("O conteúdo não corresponde ao tipo do arquivo.");
}

export type Crop = { zoom: number; x: number; y: number };

/** Scale of the image inside a square viewport of `view` pixels. */
export const scaleFor = (w: number, h: number, view: number, zoom: number) => (view / Math.min(w, h)) * zoom;

/** Keeps the image covering the whole square (no empty borders). */
export function clampCrop(w: number, h: number, view: number, c: Crop): Crop {
  const zoom = Math.min(4, Math.max(1, c.zoom));
  const s = scaleFor(w, h, view, zoom);
  const mx = Math.max(0, (w * s - view) / 2);
  const my = Math.max(0, (h * s - view) / 2);
  return { zoom, x: Math.min(mx, Math.max(-mx, c.x)), y: Math.min(my, Math.max(-my, c.y)) };
}

/** Part of the original image (in its pixels) that is visible in the square. */
export function sourceRect(w: number, h: number, view: number, crop: Crop) {
  const c = clampCrop(w, h, view, crop);
  const s = scaleFor(w, h, view, c.zoom);
  const left = (view - w * s) / 2 + c.x;
  const top = (view - h * s) / 2 + c.y;
  return { sx: -left / s + 0, sy: -top / s + 0, size: view / s };
}

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error("Não foi possível abrir a foto."));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir a foto."));
    };
    img.src = url;
  });
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Square, resized and compressed photo (WebP, or JPEG where WebP is not available). */
export async function renderAvatar(img: HTMLImageElement, crop: Crop, view: number): Promise<Blob> {
  const { sx, sy, size } = sourceRect(img.naturalWidth, img.naturalHeight, view, crop);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = avatarSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a foto.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, size, size, 0, 0, avatarSize, avatarSize);
  for (const q of [0.86, 0.75, 0.62, 0.5]) {
    let blob = await toBlob(canvas, "image/webp", q);
    if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", q);
    if (blob && blob.size <= avatarMaxBytes) return blob;
  }
  throw new Error("Não foi possível reduzir a foto.");
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não foi possível ler a foto."));
    r.readAsDataURL(blob);
  });
