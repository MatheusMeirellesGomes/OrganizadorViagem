import type { Trip } from "./model";
export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Falha ao ler anexo para o backup."));
    r.readAsDataURL(blob);
  });
}
export async function portableTrips(
  trips: Trip[],
  download: (bucket: string, path: string) => Promise<Blob>,
  encode = blobDataUrl,
): Promise<Trip[]> {
  const result: Trip[] = [];
  for (const trip of trips) {
    const photos = [],
      documents = [];
    for (const photo of trip.photos || [])
      photos.push({
        ...photo,
        url: photo.url.startsWith("data:")
          ? photo.url
          : await encode(await download("trip-photos", photo.url)),
      });
    for (const doc of trip.documents || [])
      documents.push({
        ...doc,
        url: doc.url.startsWith("data:")
          ? doc.url
          : await encode(await download("trip-documents", doc.url)),
      });
    result.push({ ...trip, photos, ...(trip.documents ? { documents } : {}) });
  }
  return result;
}
