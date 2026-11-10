import { newTrip, type Trip, dateLabel, pictures } from "./model";
export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function offlineDocument(trip: Trip) {
  const e = escapeHtml;
  const days = [...new Set(trip.activities.map((a) => a.day))].sort(
    (a, b) => a - b,
  );
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(trip.title)} — Gomes pelo Mundo offline</title><style>body{font:16px system-ui;color:#244f43;background:#f6f8f1;max-width:760px;margin:auto;padding:28px}h1{font-size:34px}small{color:#718067}section{background:white;border:1px solid #e0e7d8;border-radius:12px;padding:22px;margin:20px 0}article{padding:15px 0;border-bottom:1px solid #eee}h3{margin:5px 0}p{line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}button{padding:12px;border:0;border-radius:8px;background:#244f43;color:white}@media print{button{display:none}}</style><small>GOMES PELO MUNDO · CÓPIA OFFLINE</small><h1>${e(trip.title)}</h1><p>${e(trip.destination)} · ${e(dateLabel(trip))}</p><small>Exportado em ${e(new Date().toLocaleString("pt-BR"))}. Esta cópia não recebe alterações automaticamente.</small>${trip.hotel ? `<section><h2>Hospedagem</h2><p>${e(trip.hotel)}</p></section>` : ""}${days
    .map(
      (day) =>
        `<section><h2>Dia ${day}</h2>${trip.activities
          .filter((a) => a.day === day)
          .map(
            (a) =>
              `<article><small>${e(a.time || "Sem horário")} · ${e(a.kind)}</small><h3>${a.done ? "✓ " : ""}${e(a.title)}</h3><p>${e(a.address)}</p></article>`,
          )
          .join("")}</section>`,
    )
    .join(
      "",
    )}${trip.notes ? `<section><h2>Anotações</h2><p>${e(trip.notes)}</p></section>` : ""}<section><h2>Reservas</h2>${trip.reservations.map((r) => `<article><h3>${e(r.title)}</h3><p>${e(r.details)}</p>${/^https?:\/\//i.test(r.url) ? `<a href="${e(r.url)}" rel="noreferrer">Abrir link (precisa de internet)</a>` : ""}</article>`).join("") || "<p>Nenhuma reserva cadastrada.</p>"}</section><section><h2>Checklist</h2>${trip.checklist.map((c) => `<p>${c.done ? "☑" : "☐"} ${e(c.title)}</p>`).join("") || "<p>Nenhuma tarefa cadastrada.</p>"}</section><p>Guarde este arquivo em um lugar privado: ele pode conter dados de reservas.</p></html>`;
}
export function downloadOffline(trip: Trip) {
  const url = URL.createObjectURL(
    new Blob([offlineDocument(trip)], { type: "text/html;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "gomes-roteiro-offline.html";
  a.click();
  URL.revokeObjectURL(url);
}
const text = (v: unknown, fallback = "") =>
  typeof v === "string" ? v : fallback;
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown) => (Array.isArray(v) ? v : []);
export function parseBackup(raw: string): Trip[] {
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 1 || !Array.isArray(parsed.trips))
    throw new Error("Este arquivo não é um backup Gomes pelo Mundo válido.");
  if (parsed.trips.length > 500)
    throw new Error("O backup excede 500 viagens.");
  return parsed.trips.map((value: unknown) => {
    const v = object(value);
    const trip = newTrip({
      title: text(v.title, "Nova viagem"),
      destination: text(v.destination),
      scope: ["national", "international"].includes(text(v.scope))
        ? (v.scope as Trip["scope"])
        : "undecided",
      start: text(v.start),
      end: text(v.end),
      status: ["planning", "upcoming", "active", "past"].includes(
        text(v.status),
      )
        ? (v.status as Trip["status"])
        : "planning",
      cover: Object.hasOwn(pictures, text(v.cover))
        ? text(v.cover)
        : "coast",
      notes: text(v.notes),
      hotel: text(v.hotel),
      budgetEnabled: v.budgetEnabled === true,
    });
    const party=object(v.party);
    if(v.party) trip.party={adults:typeof party.adults==='number'&&party.adults>=0?Math.floor(party.adults):undefined,children:typeof party.children==='number'&&party.children>=0?Math.floor(party.children):undefined,members:list(party.members).filter((x):x is string=>typeof x==='string'),preferences:text(party.preferences)};
    const coords = object(v.coordinates);
    if (
      typeof coords.lat === "number" &&
      typeof coords.lng === "number" &&
      Math.abs(coords.lat) <= 90 &&
      Math.abs(coords.lng) <= 180
    )
      trip.coordinates = { lat: coords.lat, lng: coords.lng };
    trip.activities = list(v.activities).map((value) => {
      const a = object(value);
      return {
        id: crypto.randomUUID(),
        title: text(a.title, "Atividade"),
        day: Math.max(1, Math.min(365, Number(a.day) || 1)),
        time: text(a.time),
        address: text(a.address),
        kind: text(a.kind, "Passeio"),
        period: (["morning","afternoon","evening","any"].includes(text(a.period))?text(a.period):"any") as import("./calendar").Period,
        done: a.done === true,
      };
    });
    trip.checklist = list(v.checklist).map((value) => {
      const c = object(value);
      return {
        id: crypto.randomUUID(),
        title: text(c.title),
        done: c.done === true,
      };
    });
    trip.expenses = list(v.expenses)
      .map(object)
      .filter(
        (x) =>
          Number.isFinite(x.amount) &&
          Number(x.amount) > 0 &&
          ["BRL", "EUR", "USD"].includes(text(x.currency)),
      )
      .map((x) => ({
        id: crypto.randomUUID(),
        title: text(x.title),
        amount: Number(x.amount),
        currency: text(x.currency),
      }));
    trip.reservations = list(v.reservations)
      .map(object)
      .map((r) => ({
        id: crypto.randomUUID(),
        title: text(r.title),
        details: text(r.details),
        url: /^https?:\/\//i.test(text(r.url)) ? text(r.url) : "",
      }));
    trip.photos = list(v.photos)
      .map(object)
      .filter((p) =>
        /^data:image\/(png|jpeg|webp|gif);base64,/i.test(text(p.url)),
      )
      .map((p) => ({
        id: crypto.randomUUID(),
        url: text(p.url),
        name: text(p.name),
      }));
    return trip;
  });
}
