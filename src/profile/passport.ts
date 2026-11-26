import type { Trip } from "../model";
import type { WishItem } from "../traveler/wishlist";

/*
 * Meu Passaporte: países, continentes e carimbos das viagens concluídas.
 * Os países vêm só do que a pessoa registrou: lugares das viagens concluídas,
 * viagens nacionais (Brasil), lugares do Quero Conhecer marcados como
 * visitados e países que ela mesma marcou. Os nomes dos países saem do próprio
 * navegador (Intl.DisplayNames), sem baixar nada.
 */

export const continents = {
  sa: { label: "América do Sul", codes: "AR BO BR CL CO EC GY PY PE SR UY VE GF FK" },
  na: { label: "América do Norte e Central", codes: "AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US PR AW CW BM KY TC VG VI GL GP MQ BL MF SX BQ AI MS PM" },
  eu: { label: "Europa", codes: "AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA FO GI GG IM JE AX" },
  af: { label: "África", codes: "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH RE YT SH" },
  as: { label: "Ásia", codes: "AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE HK MO" },
  oc: { label: "Oceania", codes: "AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU NC PF GU AS MP CK NU TK WF NF PN" },
  an: { label: "Antártida", codes: "AQ" },
} as const;
export type ContinentId = keyof typeof continents;

const continentOf = new Map<string, ContinentId>();
for (const [id, c] of Object.entries(continents)) for (const code of c.codes.split(" ")) continentOf.set(code, id as ContinentId);
export const allCountries = [...continentOf.keys()];
export const isCountry = (code: string) => continentOf.has(code);
export const countryContinent = (code: string) => continentOf.get(code);

/** Bandeira em emoji a partir do código (letras indicadoras regionais). */
export const flag = (code: string) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "");

export function countryName(code: string, locale = "pt-BR") {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const aliases: Record<string, string> = {
  eua: "US", usa: "US", "estados unidos da america": "US", america: "US", uk: "GB", inglaterra: "GB", escocia: "GB", "pais de gales": "GB", "irlanda do norte": "GB", england: "GB", scotland: "GB", holanda: "NL", "paises baixos": "NL", "coreia": "KR", "korea": "KR", "republica tcheca": "CZ", tchequia: "CZ", "emirados": "AE", dubai: "AE", "russia": "RU", "vaticano": "VA", "macau": "MO", "taiwan": "TW",
};
let byName: Map<string, string> | undefined;
/** Código do país a partir de um nome em português, inglês ou espanhol. */
export function countryCode(name: string): string | undefined {
  const n = norm(name);
  if (!n) return;
  if (/^[a-z]{2}$/.test(n) && isCountry(n.toUpperCase())) return n.toUpperCase();
  if (aliases[n]) return aliases[n];
  if (!byName) {
    byName = new Map();
    for (const locale of ["pt-BR", "en", "es"])
      for (const code of allCountries) {
        const label = countryName(code, locale);
        if (label !== code) byName.set(norm(label), code);
      }
  }
  return byName.get(n);
}

/** Países que aparecem no destino ("Lisboa, Portugal" → PT). */
function fromText(text: string): string[] {
  const parts = text.split(/[,/–\-·|]| e /).map((p) => p.trim()).filter(Boolean);
  return [...new Set([text, ...parts].map(countryCode).filter((c): c is string => Boolean(c)))];
}

export type Stamp = { trip: Trip; countries: string[]; start?: string; end?: string };
export type CountryEntry = { code: string; continent: ContinentId; trips: string[]; manual: boolean; wish: boolean; first?: string };
export type Passport = { stamps: Stamp[]; countries: CountryEntry[]; continents: { id: ContinentId; label: string; visited: number; total: number }[]; cities: number };

export function tripCountries(t: Trip): string[] {
  const out = new Set<string>();
  if (t.scope === "national") out.add("BR");
  for (const c of fromText(t.destination || "")) out.add(c);
  const planned = new Set((t.activities ?? []).map((a) => a.placeId).filter(Boolean));
  for (const c of t.placeChoices ?? []) {
    if (!planned.has(c.place.id)) continue;
    const code = (c.place.tags?.country_code || "").toUpperCase();
    const v = isCountry(code) ? code : c.place.country ? countryCode(c.place.country) : undefined;
    if (v) out.add(v);
  }
  return [...out];
}

export function buildPassport(trips: Trip[], manual: string[] = [], wishes: WishItem[] = []): Passport {
  const past = trips.filter((t) => t.status === "past").sort((a, b) => (a.start || "9").localeCompare(b.start || "9"));
  const map = new Map<string, CountryEntry>();
  const touch = (code: string, patch: Partial<CountryEntry>) => {
    const continent = countryContinent(code);
    if (!continent) return;
    const e = map.get(code) ?? { code, continent, trips: [], manual: false, wish: false };
    if (patch.trips) e.trips.push(...patch.trips);
    if (patch.manual) e.manual = true;
    if (patch.wish) e.wish = true;
    if (patch.first && (!e.first || patch.first < e.first)) e.first = patch.first;
    map.set(code, e);
  };
  const stamps = past.map((t) => {
    const countries = tripCountries(t);
    for (const c of countries) touch(c, { trips: [t.title], first: t.start || undefined });
    return { trip: t, countries, start: t.start || undefined, end: t.end || undefined };
  });
  for (const c of manual) touch(c, { manual: true });
  for (const w of wishes) {
    if (!w.visitedAt) continue;
    const code = (w.place.tags?.country_code || "").toUpperCase();
    if (isCountry(code)) touch(code, { wish: true, first: w.visitedAt.slice(0, 10) });
  }
  const cities = new Set<string>();
  for (const t of past) {
    for (const s of t.stays ?? []) if (s.city?.trim()) cities.add(norm(s.city));
    if (t.destination?.trim()) cities.add(norm(t.destination.split(",")[0]));
  }
  const countries = [...map.values()].sort((a, b) => countryName(a.code).localeCompare(countryName(b.code)));
  return {
    stamps,
    countries,
    cities: cities.size,
    continents: (Object.keys(continents) as ContinentId[])
      .filter((id) => id !== "an" || map.has("AQ"))
      .map((id) => ({ id, label: continents[id].label, visited: countries.filter((c) => c.continent === id).length, total: continents[id].codes.split(" ").length })),
  };
}

/** Lista limpa de países marcados à mão (perfil). */
export const cleanCountries = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return;
  const list = [...new Set(v.filter((x): x is string => typeof x === "string" && isCountry(x)))].slice(0, 300);
  return list.length ? list : undefined;
};
