/*
 * Local date + time in an IANA time zone → absolute instant, without any
 * library: Intl tells the offset of the zone at a given instant (summer time
 * included). Used to order legs and to compute real flight durations.
 */

export function validZone(zone?: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}

/** Offset of `zone` at instant `ms`, in minutes (Lisbon in winter = 0, São Paulo = -180). */
export function zoneOffset(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

const parse = (date: string, time: string) => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time || "00:00");
  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59) return;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
};

/** Instant (ms) of a local date/time in a zone. Without a valid zone, treats it as UTC. */
export function toInstant(date: string, time: string, zone?: string): number | undefined {
  const wall = parse(date, time);
  if (wall === undefined) return;
  if (!validZone(zone)) return wall;
  let guess = wall - zoneOffset(wall, zone!) * 60000;
  const again = wall - zoneOffset(guess, zone!) * 60000;
  if (again !== guess) guess = again;
  return guess;
}

/** Minutes between two local moments in their own zones (negative when the order is wrong). */
export function minutesBetween(a: { date: string; time: string; zone?: string }, b: { date: string; time: string; zone?: string }) {
  const x = toInstant(a.date, a.time, a.zone);
  const y = toInstant(b.date, b.time, b.zone);
  if (x === undefined || y === undefined || !a.time || !b.time) return;
  return Math.round((y - x) / 60000);
}

export const durationText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
};

export const zoneLabel = (zone?: string) => (zone ? zone.split("/").pop()!.replace(/_/g, " ") : "");

/** IANA zones known by this browser (for the datalist). */
export function knownZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}
