import type { Trip } from "./model";
export type TripPhoto = {
  id: string;
  url: string;
  name: string;
  caption?: string;
  takenAt?: string;
  location?: string;
  activityId?: string;
  album?: string;
};
export function photoDimensions(width: number, height: number, max = 1600) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export async function compressPhoto(file: File): Promise<Blob> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 15 * 1024 * 1024 ||
    !file.size
  )
    throw new Error("Escolha JPG, PNG ou WebP de até 15 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const size = photoDimensions(bitmap.width, bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Este aparelho não conseguiu processar a imagem.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= 600 * 1024) return blob;
    }
    throw new Error(
      "A imagem continua grande após compressão. Escolha uma foto menor.",
    );
  } finally {
    bitmap.close();
  }
}
export function chronologicalPhotos(photos: TripPhoto[]) {
  return [...photos].sort((a, b) =>
    a.takenAt && b.takenAt
      ? a.takenAt.localeCompare(b.takenAt)
      : a.takenAt
        ? -1
        : b.takenAt
          ? 1
          : 0,
  );
}
export function removePhoto(trip: Trip, id: string): Trip {
  return {
    ...trip,
    photos: trip.photos.filter((p) => p.id !== id),
    coverPhotoId: trip.coverPhotoId === id ? undefined : trip.coverPhotoId,
  };
}
