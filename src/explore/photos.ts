import type { Place } from "../places";

/*
 * Photo identity rules.
 *
 * Wrong photos came from two places: the OpenStreetMap "image" tag, which is
 * any URL a mapper typed (sometimes a neighbour, a logo or a city view), and
 * the lead image of Wikipedia articles, which is the article's picture and not
 * always the place itself. Now a card only shows a photo that is linked to the
 * place's own identity:
 *  1. Wikidata P18 ("image") of the place's own Wikidata item;
 *  2. the OpenStreetMap wikimedia_commons=File:… tag of that object;
 *  3. for places saved before this change, the Wikipedia picture they already had.
 * Never a search by city or by name. A file used by two places in the same
 * result is kept only on the most relevant one. Without a verified photo the
 * card shows a neutral category illustration labelled "Sem foto verificada".
 */

/** File name from a Commons value: "File:X.jpg", a Special:FilePath URL or a file page URL. */
export function commonsFileName(value: string | undefined): string | undefined {
  if (!value) return;
  let v = value.trim();
  try {
    if (/^https?:\/\//.test(v)) {
      const u = new URL(v);
      if (!/(^|\.)(wikimedia|wikipedia)\.org$/.test(u.hostname)) return;
      const path = decodeURIComponent(u.pathname);
      const m =
        path.match(/\/Special:FilePath\/(.+)$/) ||
        path.match(/\/wiki\/(?:File|Ficheiro|Archivo|Arquivo|Fichier|Datei):(.+)$/);
      if (!m) return;
      v = m[1];
    }
  } catch {
    return;
  }
  v = v.replace(/^(File|Ficheiro|Arquivo|Archivo|Fichier|Datei|Image):/i, "").replace(/_/g, " ").trim();
  if (!/\.(jpe?g|png|webp|gif|tiff?)$/i.test(v) || v.includes("/")) return;
  return v;
}

/** Resized image served by Wikimedia for a Commons file. */
export function commonsThumb(file: string, width: number) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}?width=${width}`;
}

export type VerifiedPhoto = {
  url: string;
  file: string;
  /** How the photo is tied to the place. */
  via: "wikidata" | "openstreetmap" | "wikipedia";
};

export function verifiedPhoto(place: Pick<Place, "tags">, width = 640): VerifiedPhoto | undefined {
  const t = place.tags;
  if (t.image_source === "wikidata-p18" && t.image_file) {
    const file = commonsFileName("File:" + t.image_file);
    if (file) return { url: commonsThumb(file, width), file, via: "wikidata" };
  }
  if (t.provider === "openstreetmap") {
    const file = commonsFileName(t.wikimedia_commons);
    if (file) return { url: commonsThumb(file, width), file, via: "openstreetmap" };
    return; // the free-text "image" tag is never trusted
  }
  // Places saved earlier from Wikipedia: the article's own picture, from Wikimedia only.
  if (t.provider === "wikipedia" && t.image_file && t.image) {
    try {
      const u = new URL(t.image);
      if (u.protocol === "https:" && /(^|\.)wikimedia\.org$/.test(u.hostname))
        return { url: u.href, file: t.image_file.replace(/_/g, " "), via: "wikipedia" };
    } catch {
      /* invalid URL: no photo */
    }
  }
  return;
}

/**
 * The same file on two places means it shows at most one of them (for example
 * a square and the palace on it). Keeps it on the first place, which is the
 * most relevant because results are ordered by relevance.
 */
export function withUniquePhotos<T extends Pick<Place, "tags">>(places: T[]): T[] {
  const used = new Set<string>();
  return places.map((p) => {
    const photo = verifiedPhoto(p);
    if (!photo) return p;
    const key = photo.file.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return p;
    }
    const tags: Record<string, string> = { ...p.tags, photo_shared: "yes" };
    delete tags.image;
    delete tags.image_file;
    delete tags.image_source;
    delete tags.wikimedia_commons;
    return { ...p, tags };
  });
}
