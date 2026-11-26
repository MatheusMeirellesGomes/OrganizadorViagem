/* Ferramentas do viajante que funcionam sem internet. */

export const units = {
  km: { label: "km → milhas", to: "mi", f: (v: number) => v * 0.621371 },
  mi: { label: "milhas → km", to: "km", f: (v: number) => v / 0.621371 },
  c: { label: "°C → °F", to: "°F", f: (v: number) => (v * 9) / 5 + 32 },
  f: { label: "°F → °C", to: "°C", f: (v: number) => ((v - 32) * 5) / 9 },
  kg: { label: "kg → libras", to: "lb", f: (v: number) => v * 2.20462 },
  lb: { label: "libras → kg", to: "kg", f: (v: number) => v / 2.20462 },
  l: { label: "litros → galões (EUA)", to: "gal", f: (v: number) => v / 3.78541 },
  gal: { label: "galões (EUA) → litros", to: "L", f: (v: number) => v * 3.78541 },
  cm: { label: "cm → polegadas", to: "in", f: (v: number) => v / 2.54 },
  in: { label: "polegadas → cm", to: "cm", f: (v: number) => v * 2.54 },
} as const;
export type Unit = keyof typeof units;
export const convertUnit = (u: Unit, v: number) => Math.round(units[u].f(v) * 100) / 100;

/** Diferença em horas entre o fuso do destino e o do aparelho, agora. */
export function zoneDiff(zone: string, now = new Date(), localZone?: string): number | undefined {
  const minutes = (z?: string) => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: z, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) / 60000;
    } catch {
      return undefined;
    }
  };
  const a = minutes(zone);
  const b = minutes(localZone);
  return a === undefined || b === undefined ? undefined : Math.round(((a - b) / 60) * 4) / 4;
}

export function timeIn(zone: string, now = new Date(), locale = "pt-BR") {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(now);
  } catch {
    return undefined;
  }
}

/** Lê um valor digitado com vírgula ou ponto ("1.234,50", "1234.5"). */
export function parseAmount(text: string): number | undefined {
  const t = text.replace(/\s/g, "");
  if (!t) return;
  const normalized = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
