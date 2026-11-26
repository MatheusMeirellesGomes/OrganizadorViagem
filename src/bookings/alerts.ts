import type { Trip } from "../model";
import { dateOfDay } from "../planner";
import { toInstant } from "../journey/time";
import { departInstant, transportTitle } from "../journey/transport";
import type { CentralItem } from "./central";

/*
 * Linha do tempo inteligente: avisos calculados só com o que já está na
 * viagem. Nada é alterado; cada aviso diz o que conferir e onde.
 */

export type AlertLevel = "danger" | "warning" | "info";
export type TripAlert = { id: string; level: AlertLevel; title: string; detail: string; date?: string; refs: string[] };

const H = 3600000;
const zoneOf = (trip: Trip, z?: string) => z || trip.timeZone || undefined;
const fmt = (ms: number) => Math.round(ms / 60000);

type Span = { ref: string; label: string; from: number; to: number; date: string };

function legSpans(trip: Trip): Span[] {
  const out: Span[] = [];
  for (const t of trip.transports ?? [])
    t.legs.forEach((l, i) => {
      const from = departInstant(trip, l);
      const to = l.arriveTime ? toInstant(l.arriveDate || l.departDate, l.arriveTime, zoneOf(trip, l.arriveZone)) : undefined;
      if (from === undefined || to === undefined || to <= from) return;
      const label = t.legs.length > 1 ? `${transportTitle(t)} (trecho ${i + 1})` : transportTitle(t);
      out.push({ ref: "t:" + t.id, label, from, to, date: l.departDate });
    });
  return out.sort((a, b) => a.from - b.from);
}

export function tripAlerts(trip: Trip, items: CentralItem[] = [], now = Date.now()): TripAlert[] {
  const alerts: TripAlert[] = [];
  const legs = legSpans(trip);

  // 1. Trechos de transportes diferentes que se sobrepõem ou com conexão curta.
  for (let i = 0; i < legs.length; i++)
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i];
      const b = legs[j];
      if (a.ref === b.ref) continue; // conexões do mesmo transporte já são conferidas ao salvar
      if (b.from < a.to)
        alerts.push({ id: `overlap:${a.ref}:${b.ref}:${i}:${j}`, level: "danger", title: "Transportes no mesmo horário", detail: `${a.label} e ${b.label} se sobrepõem. Confira datas, horários e fusos.`, date: a.date, refs: [a.ref, b.ref] });
      else if (b.from - a.to < 45 * 60000)
        alerts.push({ id: `short:${a.ref}:${b.ref}:${i}:${j}`, level: "warning", title: "Conexão curta", detail: `Só ${fmt(b.from - a.to)} min entre ${a.label} e ${b.label}.`, date: b.date, refs: [a.ref, b.ref] });
    }

  // 2. Retirada do carro antes de o voo ou trem chegar no mesmo dia.
  for (const v of trip.vehicles ?? []) {
    const r = v.rental;
    if (!r?.pickupDate || !r.pickupTime) continue;
    const pick = toInstant(r.pickupDate, r.pickupTime, trip.timeZone);
    if (pick === undefined) continue;
    const arrival = legs.find((l) => l.from <= pick && pick < l.to);
    if (arrival)
      alerts.push({ id: `car:${v.id}`, level: "danger", title: "Retirada do carro durante o trajeto", detail: `A retirada de ${v.label || "carro"} está marcada antes de ${arrival.label} chegar.`, date: r.pickupDate, refs: ["v:" + v.id, arrival.ref] });
    else {
      const before = legs.filter((l) => l.to <= pick && pick - l.to < 40 * 60000 && l.to > pick - 12 * H);
      const l = before[before.length - 1];
      if (l)
        alerts.push({ id: `carshort:${v.id}`, level: "warning", title: "Pouco tempo para retirar o carro", detail: `Só ${fmt(pick - l.to)} min entre a chegada de ${l.label} e a retirada do carro. Contando bagagem e imigração, pode faltar tempo.`, date: r.pickupDate, refs: ["v:" + v.id, l.ref] });
    }
  }

  // 3. Hospedagens com noites em comum.
  const stays = [...(trip.stays ?? [])].filter((s) => s.start && s.end && s.end > s.start).sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < stays.length; i++)
    for (let j = i + 1; j < stays.length; j++)
      if (stays[j].start < stays[i].end)
        alerts.push({ id: `stays:${stays[i].id}:${stays[j].id}`, level: "warning", title: "Hospedagens com noites em comum", detail: `${stays[i].name} e ${stays[j].name} se sobrepõem entre ${stays[j].start} e ${stays[i].end < stays[j].end ? stays[i].end : stays[j].end}.`, date: stays[j].start, refs: ["s:" + stays[i].id, "s:" + stays[j].id] });

  // 4. Noites sem hospedagem (só quando a viagem já tem alguma).
  if (stays.length && trip.start && trip.end && trip.end > trip.start) {
    const gaps: string[] = [];
    for (let d = Date.parse(trip.start + "T00:00:00Z"); d < Date.parse(trip.end + "T00:00:00Z"); d += 24 * H) {
      const iso = new Date(d).toISOString().slice(0, 10);
      const night = (trip.transports ?? []).some((t) => t.legs.some((l) => l.departDate === iso && l.arriveDate && l.arriveDate > iso));
      if (!night && !stays.some((s) => s.start <= iso && iso < s.end)) gaps.push(iso);
    }
    if (gaps.length && gaps.length <= 60)
      alerts.push({ id: "gaps", level: "info", title: gaps.length === 1 ? "1 noite sem hospedagem" : `${gaps.length} noites sem hospedagem`, detail: gaps.slice(0, 6).join(", ") + (gaps.length > 6 ? "…" : ""), date: gaps[0], refs: [] });
  }

  // 5. Atividade com horário durante um trajeto.
  for (const a of trip.activities) {
    if (!/^\d{2}:\d{2}$/.test(a.time)) continue;
    const date = dateOfDay(trip, a.day);
    const at = date ? toInstant(date, a.time, trip.timeZone) : undefined;
    if (at === undefined) continue;
    const leg = legs.find((l) => at >= l.from && at < l.to);
    if (leg) alerts.push({ id: `act:${a.id}`, level: "warning", title: "Atividade durante um trajeto", detail: `“${a.title}” às ${a.time} acontece enquanto você está em ${leg.label}.`, date, refs: [leg.ref] });
  }

  // 6. Reservas ainda não confirmadas perto da data; prazos de cancelamento.
  const today = new Date(now).toISOString().slice(0, 10);
  for (const i of items) {
    if (i.trip.id !== trip.id) continue;
    if (i.at !== undefined && i.at > now && i.at - now < 7 * 24 * H && (!i.status || i.status === "researching"))
      alerts.push({ id: `pending:${i.id}`, level: "warning", title: "Reserva sem confirmação", detail: `${i.title} é em menos de 7 dias e ainda está ${i.status ? "em pesquisa" : "sem situação marcada"}.`, date: i.date, refs: [i.id] });
    if (i.cancelBy && i.status !== "cancelled" && i.cancelBy >= today && Date.parse(i.cancelBy + "T00:00:00Z") - Date.parse(today + "T00:00:00Z") <= 3 * 24 * H)
      alerts.push({ id: `cancel:${i.id}`, level: "info", title: "Prazo de cancelamento chegando", detail: `${i.title}: cancelamento gratuito até ${i.cancelBy}.`, date: i.cancelBy, refs: [i.id] });
  }

  const order: Record<AlertLevel, number> = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level] || (a.date ?? "").localeCompare(b.date ?? ""));
}
