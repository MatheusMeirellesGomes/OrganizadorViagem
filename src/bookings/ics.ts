import type { Trip } from "../model";
import { dateOfDay } from "../planner";
import { toInstant } from "../journey/time";
import { transportTitle } from "../journey/transport";

/*
 * Exporta a viagem para calendário (.ics, RFC 5545): trechos de transporte,
 * hospedagens (dias inteiros), retirada e devolução de carro e atividades com
 * horário. Nenhum código de reserva sai daqui (ficam guardados à parte).
 */

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const day = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);

/** Quebra linhas em 75 octetos, como pede a norma. */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

type Ev = { uid: string; title: string; start: string; end: string; allDay?: boolean; where?: string; note?: string };

export function tripEvents(trip: Trip): Ev[] {
  const ev: Ev[] = [];
  const zone = trip.timeZone;
  for (const t of trip.transports ?? [])
    t.legs.forEach((l, i) => {
      const from = l.departDate ? toInstant(l.departDate, l.departTime || "00:00", l.departZone || zone) : undefined;
      if (from === undefined) return;
      let to = l.arriveTime ? toInstant(l.arriveDate || l.departDate, l.arriveTime, l.arriveZone || zone) : undefined;
      if (to === undefined || to <= from) to = from + 3600000;
      const code = [l.carrier, l.number].filter(Boolean).join(" ");
      ev.push({ uid: `t-${t.id}-${i}`, title: `${transportTitle(t)}${code ? " · " + code : ""}`, start: utc(from), end: utc(to), where: l.from.name, note: `${l.from.name} → ${l.to.name}` });
    });
  for (const s of trip.stays ?? [])
    if (s.start && s.end && s.end >= s.start)
      ev.push({ uid: `s-${s.id}`, title: `Hospedagem: ${s.name}`, start: day(s.start), end: day(s.end > s.start ? s.end : nextDay(s.start)), allDay: true, where: [s.address, s.city].filter(Boolean).join(", "), note: [s.checkInTime && `Check-in ${s.checkInTime}`, s.checkOutTime && `Check-out ${s.checkOutTime}`].filter(Boolean).join(" · ") });
  for (const v of trip.vehicles ?? []) {
    const r = v.rental;
    const push = (kind: string, date?: string, time?: string, place?: string) => {
      const at = date ? toInstant(date, time || "09:00", zone) : undefined;
      if (at !== undefined) ev.push({ uid: `v-${v.id}-${kind}`, title: `${kind === "pick" ? "Retirar" : "Devolver"} ${v.label || "carro"}${r?.company ? " · " + r.company : ""}`, start: utc(at), end: utc(at + 1800000), where: place });
    };
    push("pick", r?.pickupDate, r?.pickupTime, r?.pickupPlace);
    push("drop", r?.dropoffDate, r?.dropoffTime, r?.dropoffPlace);
  }
  for (const a of trip.activities ?? []) {
    const date = dateOfDay(trip, a.day);
    if (!date || !/^\d{2}:\d{2}$/.test(a.time)) continue;
    const at = toInstant(date, a.time, zone);
    if (at !== undefined) ev.push({ uid: `a-${a.id}`, title: a.title, start: utc(at), end: utc(at + 3600000), where: a.address, note: a.notes });
  }
  return ev;
}

export function tripIcs(trip: Trip, now = new Date()): string {
  const stamp = utc(+now);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gomes pelo Mundo//Viagens//PT", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(trip.title)}`];
  for (const e of tripEvents(trip)) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@gomes-pelo-mundo`, `DTSTAMP:${stamp}`);
    lines.push(e.allDay ? `DTSTART;VALUE=DATE:${e.start}` : `DTSTART:${e.start}`, e.allDay ? `DTEND;VALUE=DATE:${e.end}` : `DTEND:${e.end}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.where) lines.push(`LOCATION:${esc(e.where)}`);
    if (e.note) lines.push(`DESCRIPTION:${esc(e.note)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(trip: Trip) {
  const blob = new Blob([tripIcs(trip)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (trip.title || "viagem").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "-").toLowerCase() + ".ics";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
