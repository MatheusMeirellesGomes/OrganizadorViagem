/*
 * Busca externa sem custo: montamos links já preenchidos (destino, datas,
 * pessoas) para os sites onde a pessoa pesquisa e compra. Não buscamos nem
 * mostramos preços aqui: o preço só existe quando a pessoa confere no site e
 * salva a opção para comparar.
 */

export type SearchKind = "flights" | "hotels" | "cars" | "experiences";
export type SearchInput = {
  origin?: string;
  destination: string;
  start?: string;
  end?: string;
  adults?: number;
  children?: number;
};
export type SearchLink = { id: string; name: string; url: string; note?: string };

const iso = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
const people = (i: SearchInput) => Math.min(9, Math.max(1, Math.round(i.adults || 1)));
const kids = (i: SearchInput) => Math.min(8, Math.max(0, Math.round(i.children || 0)));
/** Código IATA (3 letras) quando a pessoa digitou um. */
const iata = (v?: string) => {
  const m = /\b([A-Za-z]{3})\b/.exec((v || "").trim());
  return m && (v || "").trim().length <= 3 ? m[1].toUpperCase() : undefined;
};
const yymmdd = (d: string) => d.slice(2).replace(/-/g, "");

export function flightLinks(i: SearchInput): SearchLink[] {
  const from = (i.origin || "").trim();
  const to = i.destination.trim();
  const start = iso(i.start);
  const end = iso(i.end);
  const q = ["Voos", from && `de ${from}`, `para ${to}`, start && `em ${start}`, end && `volta ${end}`, `${people(i)} adultos`].filter(Boolean).join(" ");
  const links: SearchLink[] = [{ id: "google", name: "Google Voos", url: "https://www.google.com/travel/flights?" + new URLSearchParams({ q, hl: "pt-BR" }) }];
  const a = iata(from);
  const b = iata(to);
  if (a && b && start) {
    links.push({
      id: "skyscanner",
      name: "Skyscanner",
      url: `https://www.skyscanner.com.br/transporte/voos/${a.toLowerCase()}/${b.toLowerCase()}/${yymmdd(start)}/${end ? yymmdd(end) + "/" : ""}?` + new URLSearchParams({ adultsv2: String(people(i)), ...(kids(i) ? { childrenv2: Array(kids(i)).fill("8").join("|") } : {}) }),
    });
    links.push({ id: "kayak", name: "Kayak", url: `https://www.kayak.com.br/flights/${a}-${b}/${start}${end ? "/" + end : ""}/${people(i)}adults${kids(i) ? "/children-" + Array(kids(i)).fill("11").join("-") : ""}` });
  } else links.push({ id: "skyscanner", name: "Skyscanner", url: "https://www.skyscanner.com.br/", note: "Use códigos de aeroporto (ex.: GRU e LIS) para abrir já preenchido." });
  return links;
}

export function hotelLinks(i: SearchInput): SearchLink[] {
  const to = i.destination.trim();
  const start = iso(i.start);
  const end = iso(i.end);
  const dates: Record<string, string> = start && end ? { checkin: start, checkout: end } : {};
  return [
    { id: "booking", name: "Booking.com", url: "https://www.booking.com/searchresults.pt-br.html?" + new URLSearchParams({ ss: to, ...dates, group_adults: String(people(i)), group_children: String(kids(i)), no_rooms: "1" }) },
    { id: "airbnb", name: "Airbnb", url: `https://www.airbnb.com.br/s/${encodeURIComponent(to)}/homes?` + new URLSearchParams({ ...dates, adults: String(people(i)), ...(kids(i) ? { children: String(kids(i)) } : {}) }) },
    { id: "google", name: "Google Hotéis", url: "https://www.google.com/travel/search?" + new URLSearchParams({ q: `hotéis em ${to}`, hl: "pt-BR" }) },
  ];
}

export function carLinks(i: SearchInput): SearchLink[] {
  const to = i.destination.trim();
  const start = iso(i.start);
  const end = iso(i.end);
  return [
    { id: "kayak", name: "Kayak Carros", url: `https://www.kayak.com.br/cars/${encodeURIComponent(to)}${start ? "/" + start : ""}${start && end ? "/" + end : ""}` },
    { id: "rentcars", name: "Rentcars", url: "https://www.rentcars.com/pt-br/", note: "Digite o local e as datas no site." },
    { id: "maps", name: "Locadoras no mapa", url: "https://www.google.com/maps/search/?" + new URLSearchParams({ api: "1", query: `aluguel de carros ${to}` }) },
  ];
}

export function experienceLinks(i: SearchInput): SearchLink[] {
  const to = i.destination.trim();
  return [
    { id: "getyourguide", name: "GetYourGuide", url: "https://www.getyourguide.com.br/s/?" + new URLSearchParams({ q: to, ...(iso(i.start) ? { date_from: i.start! } : {}), ...(iso(i.end) ? { date_to: i.end! } : {}) }) },
    { id: "viator", name: "Viator", url: "https://www.viator.com/pt-BR/searchResults/all?" + new URLSearchParams({ text: to }) },
    { id: "tripadvisor", name: "Tripadvisor", url: "https://www.tripadvisor.com.br/Search?" + new URLSearchParams({ q: `${to} passeios` }) },
  ];
}

export const searchKinds: Record<SearchKind, { label: string; links: (i: SearchInput) => SearchLink[]; category: "tickets" | "hotels" | "rentals" | "entries" }> = {
  flights: { label: "Voos", links: flightLinks, category: "tickets" },
  hotels: { label: "Hotéis", links: hotelLinks, category: "hotels" },
  cars: { label: "Carros", links: carLinks, category: "rentals" },
  experiences: { label: "Passeios", links: experienceLinks, category: "entries" },
};
