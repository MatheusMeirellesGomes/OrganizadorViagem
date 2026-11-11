import type { TripDocument } from "./model";
export const documentLimit = 1024 * 1024;
export const documentBucket = "trip-documents";
export const documentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export function validDocumentData(url: string): boolean {
  const match =
    /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      url,
    );
  if (!match || match[2].length > Math.ceil(documentLimit / 3) * 4)
    return false;
  try {
    const raw = atob(match[2]);
    if (!raw.length || raw.length > documentLimit) return false;
    return match[1] === "application/pdf"
      ? raw.startsWith("%PDF-")
      : match[1] === "image/jpeg"
        ? raw.startsWith("\xff\xd8\xff")
        : match[1] === "image/png"
          ? raw.startsWith("\x89PNG\r\n\x1a\n")
          : raw.startsWith("RIFF") && raw.slice(8, 12) === "WEBP";
  } catch {
    return false;
  }
}
export function readDocument(file: Blob): Promise<string> {
  if (
    !documentTypes.includes(file.type) ||
    file.size > documentLimit ||
    file.size === 0
  )
    return Promise.reject(
      new Error("Escolha PDF, JPG, PNG ou WebP com até 1 MB."),
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const url = String(reader.result);
      validDocumentData(url)
        ? resolve(url)
        : reject(new Error("O conteúdo não corresponde ao tipo do arquivo."));
    };
    reader.readAsDataURL(file);
  });
}
export function downloadDocument(document: TripDocument, url: string) {
  const a = window.document.createElement("a");
  a.href = url;
  a.download = document.name;
  a.rel = "noreferrer";
  a.click();
}
