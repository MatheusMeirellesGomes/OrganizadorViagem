import { validTimeZone } from "./travel-clock";
import { validDocumentData } from "./documents";
import { isCurrency } from "./budget";
import { newTrip, type Trip, dateLabel, pictures } from "./model";
import { getLocale, t, translate } from "./i18n";
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
  return `<!doctype html><html lang="${getLocale()}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(trip.title)} — Gomes pelo Mundo offline</title><style>body{font:16px system-ui;color:#244f43;background:#f6f8f1;max-width:760px;margin:auto;padding:28px}h1{font-size:34px}small{color:#718067}section{background:white;border:1px solid #e0e7d8;border-radius:12px;padding:22px;margin:20px 0}article{padding:15px 0;border-bottom:1px solid #eee}h3{margin:5px 0}p{line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}button{padding:12px;border:0;border-radius:8px;background:#244f43;color:white}@media print{button{display:none}}</style><small>${e(t("GOMES PELO MUNDO · CÓPIA OFFLINE"))}</small><h1>${e(trip.title)}</h1><p>${e(trip.destination)} · ${e(t(dateLabel(trip)))}</p><small>${e(translate("Exportado em {date}. Esta cópia não recebe alterações automaticamente.", getLocale(), { date: new Date().toLocaleString(getLocale()) }))}</small>${trip.hotel ? `<section><h2>${e(t("Hospedagem"))}</h2><p>${e(trip.hotel)}</p></section>` : ""}${(trip.stays || []).map((s) => `<section><h2>${e(s.name)}</h2><p>${e([s.address, s.city].filter(Boolean).join(", "))}</p><p>${e(t("Entrada:"))} ${e(s.start)} ${e(s.checkInTime)} ${e(t("· Saída:"))} ${e(s.end)} ${e(s.checkOutTime)}</p><p>${e(s.confirmation)}</p><p>${e(s.notes)}</p></section>`).join("")}${days
    .map(
      (day) =>
        `<section><h2>${e(translate("Dia {number}", getLocale(), { number: day }))}</h2>${trip.activities
          .filter((a) => a.day === day)
          .map(
            (a) =>
              `<article><small>${e(a.time || t("Sem horário"))} · ${e(t(a.kind))}</small><h3>${a.done ? "✓ " : ""}${e(a.title)}</h3><p>${e(a.address)}</p></article>`,
          )
          .join("")}</section>`,
    )
    .join(
      "",
    )}${trip.notes ? `<section><h2>${e(t("Anotações"))}</h2><p>${e(trip.notes)}</p></section>` : ""}<section><h2>${e(t("Reservas"))}</h2>${trip.reservations.map((r) => `<article><h3>${e(r.title)}</h3><p>${e(r.details)}</p>${/^https?:\/\//i.test(r.url) ? `<a href="${e(r.url)}" rel="noreferrer">${e(t("Abrir link (precisa de internet)"))}</a>` : ""}</article>`).join("") || `<p>${e(t("Nenhuma reserva cadastrada."))}</p>`}</section><section><h2>Checklist</h2>${trip.checklist.map((c) => `<p>${c.done ? "☑" : "☐"} ${e(c.title)}</p>`).join("") || `<p>${e(t("Nenhuma tarefa cadastrada."))}</p>`}</section><p>${e(t("Guarde este arquivo em um lugar privado: ele pode conter dados de reservas."))}</p></html>`;
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
      timeZone: validTimeZone(text(v.timeZone))
        ? text(v.timeZone) || undefined
        : undefined,
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
      cover: Object.hasOwn(pictures, text(v.cover)) ? text(v.cover) : "coast",
      notes: text(v.notes),
      hotel: text(v.hotel),
      budgetEnabled: v.budgetEnabled === true,
    });
    const party = object(v.party);
    if (v.party)
      trip.party = {
        adults:
          typeof party.adults === "number" && party.adults >= 0
            ? Math.floor(party.adults)
            : undefined,
        children:
          typeof party.children === "number" && party.children >= 0
            ? Math.floor(party.children)
            : undefined,
        members: list(party.members).filter(
          (x): x is string => typeof x === "string",
        ),
        preferences: text(party.preferences),
      };
    const coords = object(v.coordinates);
    if (
      typeof coords.lat === "number" &&
      typeof coords.lng === "number" &&
      Math.abs(coords.lat) <= 90 &&
      Math.abs(coords.lng) <= 180
    )
      trip.coordinates = { lat: coords.lat, lng: coords.lng };
    const activityIds = new Map<string, string>(),
      stayIds = new Map<string, string>();
    trip.stays = list(v.stays).map((value) => {
      const s = object(value),
        id = crypto.randomUUID();
      if (text(s.id)) stayIds.set(text(s.id), id);
      const coords = object(s.coordinates);
      return {
        id,
        name: text(s.name, "Hospedagem"),
        address: text(s.address),
        city: text(s.city),
        start: text(s.start),
        end: text(s.end),
        checkInTime: text(s.checkInTime),
        checkOutTime: text(s.checkOutTime),
        url: /^https?:\/\//i.test(text(s.url)) ? text(s.url) : "",
        confirmation: text(s.confirmation),
        notes: text(s.notes),
        coordinates:
          typeof coords.lat === "number" &&
          typeof coords.lng === "number" &&
          Math.abs(coords.lat) <= 90 &&
          Math.abs(coords.lng) <= 180
            ? { lat: coords.lat, lng: coords.lng }
            : undefined,
      };
    });
    trip.activities = list(v.activities).map((value) => {
      const a = object(value),
        id = crypto.randomUUID();
      if (text(a.id)) activityIds.set(text(a.id), id);
      return {
        id,
        title: text(a.title, "Atividade"),
        placeId: text(a.placeId) || undefined,
        source: /^https?:\/\//i.test(text(a.source))
          ? text(a.source)
          : undefined,
        coordinates:
          typeof object(a.coordinates).lat === "number" &&
          typeof object(a.coordinates).lng === "number" &&
          Math.abs(Number(object(a.coordinates).lat)) <= 90 &&
          Math.abs(Number(object(a.coordinates).lng)) <= 180
            ? {
                lat: Number(object(a.coordinates).lat),
                lng: Number(object(a.coordinates).lng),
              }
            : undefined,
        day: Math.max(1, Math.min(365, Number(a.day) || 1)),
        time: text(a.time),
        address: text(a.address),
        kind: text(a.kind, "Passeio"),
        period: (["morning", "afternoon", "evening", "any"].includes(
          text(a.period),
        )
          ? text(a.period)
          : "any") as import("./calendar").Period,
        done: a.done === true,
        notes: text(a.notes).slice(0, 500) || undefined,
        stayId: stayIds.get(text(a.stayId)),
        meal: (["breakfast", "brunch", "lunch", "afternoon", "dinner", "dessert"].includes(text(a.meal))
          ? text(a.meal)
          : undefined) as import("./meals").MealKind | undefined,
        status: (["started", "skipped"].includes(text(a.status)) ? text(a.status) : undefined) as
          | "started"
          | "skipped"
          | undefined,
        history: list(a.history)
          .map(object)
          .filter((h) => text(h.at) && text(h.what))
          .slice(-50)
          .map((h) => ({ at: text(h.at), what: text(h.what).slice(0, 200) })),
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
    const reservationIds = new Map<string, string>();
    trip.reservations = list(v.reservations)
      .map(object)
      .map((r) => {
        const id = crypto.randomUUID();
        if (text(r.id)) reservationIds.set(text(r.id), id);
        return {
          id,
          title: text(r.title),
          details: text(r.details),
          activityId: activityIds.get(text(r.activityId)),
          stayId: stayIds.get(text(r.stayId)),
          url: /^https?:\/\//i.test(text(r.url)) ? text(r.url) : "",
        };
      });
    trip.placeChoices = list(v.placeChoices)
      .map(object)
      .filter(
        (c) =>
          ["want", "maybe", "skip", "visited"].includes(text(c.decision)) &&
          text(object(c.place).id) &&
          text(object(c.place).name),
      )
      .map((c) => {
        const p = object(c.place),
          co = object(p.coordinates);
        return {
          decision: c.decision as import("./choices").Decision,
          decidedAt: text(c.decidedAt),
          place: {
            id: text(p.id),
            name: text(p.name),
            address: text(p.address),
            city: text(p.city),
            country: text(p.country),
            category: text(p.category, "other"),
            source: /^https?:\/\//i.test(text(p.source)) ? text(p.source) : "",
            website: /^https?:\/\//i.test(text(p.website))
              ? text(p.website)
              : undefined,
            retrievedAt: text(p.retrievedAt),
            updatedAt: text(p.updatedAt) || undefined,
            tags: Object.fromEntries(
              Object.entries(object(p.tags)).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            ),
            coordinates:
              typeof co.lat === "number" &&
              typeof co.lng === "number" &&
              Math.abs(co.lat) <= 90 &&
              Math.abs(co.lng) <= 180
                ? { lat: co.lat, lng: co.lng }
                : undefined,
          },
        };
      });
    const documentIds = new Map<string, string>();
    trip.documents = list(v.documents)
      .map(object)
      .filter((d) => validDocumentData(text(d.url)))
      .map((d) => ({
        id: (() => {
          const id = crypto.randomUUID();
          if (text(d.id)) documentIds.set(text(d.id), id);
          return id;
        })(),
        name: text(d.name, "Documento"),
        mime: text(d.url).slice(5).split(";")[0],
        size: atob(text(d.url).split(",")[1]).length,
        url: text(d.url),
        reservationId: reservationIds.get(text(d.reservationId)),
      }));
    const photoIds = new Map<string, string>();
    trip.photos = list(v.photos)
      .map(object)
      .filter((p) =>
        /^data:image\/(png|jpeg|webp|gif);base64,/i.test(text(p.url)),
      )
      .map((p) => {
        const id = crypto.randomUUID();
        if (text(p.id)) photoIds.set(text(p.id), id);
        return {
          id,
          caption: text(p.caption),
          takenAt: text(p.takenAt),
          location: text(p.location),
          album: text(p.album),
          activityId: activityIds.get(text(p.activityId)),
          url: text(p.url),
          name: text(p.name),
        };
      });
    trip.coverPhotoId = photoIds.get(text(v.coverPhotoId));
    parseMoney(v, trip, { activityIds, stayIds, reservationIds, documentIds });
    return trip;
  });
}

const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Expenses, people and reimbursements of a backup (Fase 4), with new ids and links kept. */
function parseMoney(
  v: Record<string, unknown>,
  trip: Trip,
  maps: { activityIds: Map<string, string>; stayIds: Map<string, string>; reservationIds: Map<string, string>; documentIds: Map<string, string> },
) {
  const people = new Map<string, string>();
  trip.participants = list(v.participants)
    .map(object)
    .filter((p) => text(p.name).trim())
    .slice(0, 100)
    .map((p) => {
      const id = crypto.randomUUID();
      if (text(p.id)) people.set(text(p.id), id);
      return { id, name: text(p.name).slice(0, 80), group: text(p.group).slice(0, 80) || undefined };
    });
  const person = (x: unknown) => people.get(text(x));
  const statuses = ["planned", "reserved", "partial", "paid", "cancelled"];
  trip.expenses = list(v.expenses)
    .map(object)
    .filter((x) => isCurrency(text(x.currency)) && ((finite(x.amount) ?? -1) > 0 || (finite(x.estimate) ?? -1) > 0) && (finite(x.amount) ?? 0) >= 0)
    .map((x) => {
      const split = object(x.split);
      const values = object(split.values);
      const conversion = object(x.conversion);
      return {
        id: crypto.randomUUID(),
        title: text(x.title).slice(0, 200),
        amount: finite(x.amount) ?? 0,
        currency: text(x.currency),
        estimate: finite(x.estimate),
        status: statuses.includes(text(x.status)) ? (text(x.status) as import("./budget").ExpenseStatus) : undefined,
        category: text(x.category).slice(0, 60) || undefined,
        date: /^\d{4}-\d{2}-\d{2}$/.test(text(x.date)) ? text(x.date) : undefined,
        day: Number.isInteger(x.day) && Number(x.day) > 0 ? Number(x.day) : undefined,
        payerId: person(x.payerId),
        split: ["equal", "shares", "percent", "amounts"].includes(text(split.mode))
          ? {
              mode: text(split.mode) as import("./budget").SplitMode,
              participants: list(split.participants).map(person).filter((p): p is string => Boolean(p)),
              values: Object.fromEntries(
                Object.entries(values)
                  .map(([k, n]) => [person(k), finite(n)] as const)
                  .filter((e): e is readonly [string, number] => Boolean(e[0]) && e[1] !== undefined),
              ),
            }
          : undefined,
        notes: text(x.notes).slice(0, 500) || undefined,
        receiptDocumentId: maps.documentIds.get(text(x.receiptDocumentId)),
        activityId: maps.activityIds.get(text(x.activityId)),
        stayId: maps.stayIds.get(text(x.stayId)),
        reservationId: maps.reservationIds.get(text(x.reservationId)),
        conversion:
          isCurrency(text(conversion.currency)) && (finite(conversion.rate) ?? 0) > 0
            ? { currency: text(conversion.currency), rate: finite(conversion.rate)!, date: text(conversion.date), source: text(conversion.source).slice(0, 120) }
            : undefined,
      };
    });
  trip.settlements = list(v.settlements)
    .map(object)
    .filter((x) => person(x.from) && person(x.to) && (finite(x.amount) ?? 0) > 0 && isCurrency(text(x.currency)))
    .map((x) => ({ id: crypto.randomUUID(), from: person(x.from)!, to: person(x.to)!, amount: finite(x.amount)!, currency: text(x.currency), date: text(x.date), done: x.done === true }));
  const budget = object(v.budget);
  if ((finite(budget.amount) ?? 0) > 0 && isCurrency(text(budget.currency)))
    trip.budget = { amount: finite(budget.amount)!, currency: text(budget.currency) };
  trip.customExpenseCategories = list(v.customExpenseCategories).filter((c): c is string => typeof c === "string").map((c) => c.slice(0, 40)).slice(0, 30);
  const times = object(v.mealTimes);
  trip.mealTimes = Object.fromEntries(
    Object.entries(times).filter(([k, t]) => ["breakfast", "brunch", "lunch", "afternoon", "dinner", "dessert"].includes(k) && /^\d{2}:\d{2}$/.test(text(t))),
  ) as Trip["mealTimes"];
}
