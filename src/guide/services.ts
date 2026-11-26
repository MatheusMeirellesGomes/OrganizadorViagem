/*
 * Serviços gratuitos e sem chave usados pelo guia:
 * - Open-Meteo (geocodificação e previsão do tempo, dados CC BY 4.0);
 * - Frankfurter (cotações de referência do Banco Central Europeu);
 * - Wikipédia (resumo do destino, texto CC BY-SA).
 * Cada resposta fica guardada neste aparelho com a data, para funcionar sem
 * internet mostrando quando foi atualizada.
 */

type Fetcher = typeof fetch;
const timeout = () => AbortSignal.timeout(12000);

export type Place = { name: string; country?: string; countryCode?: string; lat: number; lng: number; timezone?: string; admin?: string };

export async function geocode(name: string, lang = "pt", fetcher: Fetcher = fetch): Promise<Place | undefined> {
  const q = name.split(",")[0].trim();
  if (!q) return;
  const res = await fetcher("https://geocoding-api.open-meteo.com/v1/search?" + new URLSearchParams({ name: q, count: "1", language: lang, format: "json" }), { signal: timeout() });
  if (!res.ok) throw new Error("geo");
  const r = ((await res.json()) as { results?: Record<string, unknown>[] }).results?.[0];
  if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") return;
  return {
    name: String(r.name ?? q),
    country: typeof r.country === "string" ? r.country : undefined,
    countryCode: typeof r.country_code === "string" ? r.country_code.toUpperCase() : undefined,
    lat: r.latitude,
    lng: r.longitude,
    timezone: typeof r.timezone === "string" ? r.timezone : undefined,
    admin: typeof r.admin1 === "string" ? r.admin1 : undefined,
  };
}

export type DayWeather = { date: string; max: number; min: number; rain?: number; code: number };
export async function forecast(lat: number, lng: number, fetcher: Fetcher = fetch): Promise<DayWeather[]> {
  const res = await fetcher(
    "https://api.open-meteo.com/v1/forecast?" +
      new URLSearchParams({ latitude: lat.toFixed(3), longitude: lng.toFixed(3), daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max", timezone: "auto", forecast_days: "7" }),
    { signal: timeout() },
  );
  if (!res.ok) throw new Error("weather");
  const d = ((await res.json()) as { daily?: Record<string, unknown[]> }).daily;
  if (!d || !Array.isArray(d.time)) return [];
  return d.time.map((date, i) => ({
    date: String(date),
    max: Number(d.temperature_2m_max?.[i]),
    min: Number(d.temperature_2m_min?.[i]),
    rain: typeof d.precipitation_probability_max?.[i] === "number" ? (d.precipitation_probability_max[i] as number) : undefined,
    code: Number(d.weather_code?.[i]),
  })).filter((x) => Number.isFinite(x.max) && Number.isFinite(x.min));
}

/** Códigos WMO resumidos em português. */
export function weatherLabel(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "Céu limpo", icon: "☀️" };
  if (code <= 2) return { label: "Poucas nuvens", icon: "🌤️" };
  if (code === 3) return { label: "Nublado", icon: "☁️" };
  if (code === 45 || code === 48) return { label: "Neblina", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Garoa", icon: "🌦️" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: "Chuva", icon: "🌧️" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Neve", icon: "🌨️" };
  if (code >= 95) return { label: "Tempestade", icon: "⛈️" };
  return { label: "Tempo variável", icon: "🌥️" };
}

export type Rate = { from: string; to: string; rate: number; date: string };
export async function latestRate(from: string, to: string, fetcher: Fetcher = fetch): Promise<Rate> {
  if (from === to) return { from, to, rate: 1, date: new Date().toISOString().slice(0, 10) };
  const res = await fetcher(`https://api.frankfurter.app/latest?` + new URLSearchParams({ from, to }), { signal: timeout() });
  if (!res.ok) throw new Error("rate");
  const j = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const rate = j.rates?.[to];
  if (!(typeof rate === "number" && rate > 0) || !j.date) throw new Error("rate");
  return { from, to, rate, date: j.date };
}

export type Summary = { title: string; text: string; url: string; image?: string; lang: string };
export async function wikiSummary(title: string, lang = "pt", fetcher: Fetcher = fetch): Promise<Summary | undefined> {
  const t = title.split(",")[0].trim();
  if (!t) return;
  const res = await fetcher(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, "_"))}?redirect=true`, { signal: timeout(), headers: { accept: "application/json" } });
  if (!res.ok) return;
  const j = (await res.json()) as { type?: string; title?: string; extract?: string; content_urls?: { desktop?: { page?: string } }; thumbnail?: { source?: string } };
  if (j.type === "disambiguation" || !j.extract) return;
  const image = j.thumbnail?.source && /^https:\/\/upload\.wikimedia\.org\//.test(j.thumbnail.source) ? j.thumbnail.source : undefined;
  return { title: j.title || t, text: j.extract, url: j.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t)}`, image, lang };
}

/** Guarda neste aparelho o que foi buscado, com a hora. */
export function cached<T>(key: string): { value: T; at: string } | undefined {
  try {
    const v = JSON.parse(localStorage.getItem("gomes-guia:" + key) || "null");
    return v && v.at ? v : undefined;
  } catch {
    return undefined;
  }
}
export function remember<T>(key: string, value: T) {
  try {
    localStorage.setItem("gomes-guia:" + key, JSON.stringify({ value, at: new Date().toISOString() }));
  } catch {
    // Sem espaço: só não funciona sem internet.
  }
}
