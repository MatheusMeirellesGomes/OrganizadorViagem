import { uid, type Trip } from "../model";
import { isCurrency } from "../budget";
import { cleanTransport } from "./transport";
import { cleanVehicle } from "./vehicles";
import { cleanPacking } from "./packing";
import { cleanReminders } from "./reminders";
import { cleanPrep } from "./prep";
import { isWalletCategory } from "./wallet";
import type { Comparison } from "./vehicles";

/*
 * Etapa 16 data inside a backup. Imported trips are new copies, so every id
 * gets a new value and links are rebuilt. Booking references are never in a
 * backup; an imported copy starts without them (hasSecret = false).
 */

type Maps = {
  activityIds: Map<string, string>;
  stayIds: Map<string, string>;
  reservationIds: Map<string, string>;
  documentIds: Map<string, string>;
  people: Map<string, string>;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function cleanComparison(v: unknown): Comparison | undefined {
  const c = obj(v);
  if (!isCurrency(str(c.currency))) return;
  const n = (x: unknown, max = 1e7) => {
    const k = num(x);
    return k !== undefined && k >= 0 && k <= max ? k : undefined;
  };
  return {
    currency: str(c.currency),
    km: n(c.km, 40000),
    fuelPrice: n(c.fuelPrice, 1e4),
    tolls: n(c.tolls),
    parkingPerDay: n(c.parkingPerDay),
    days: n(c.days, 400),
    passengers: n(c.passengers, 100),
    bags: n(c.bags, 100),
    drivers: n(c.drivers, 100),
    options: arr(c.options)
      .map(obj)
      .slice(0, 8)
      .map((o) => ({
        id: uid(),
        name: str(o.name).slice(0, 60) || "Opção",
        cars: arr(o.cars)
          .map(obj)
          .slice(0, 6)
          .map((car) => ({ label: str(car.label).slice(0, 40) || "Carro", rental: n(car.rental), efficiency: n(car.efficiency, 100), seats: n(car.seats, 60), bags: n(car.bags, 60) })),
      })),
  };
}

export function parseJourney(v: Record<string, unknown>, trip: Trip, maps: Maps) {
  const transportIds = new Map<string, string>();
  const vehicleIds = new Map<string, string>();
  trip.vehicles = arr(v.vehicles)
    .slice(0, 30)
    .map((raw) => {
      const c = cleanVehicle(raw);
      if (!c) return;
      const id = uid();
      if (str(obj(raw).id)) vehicleIds.set(str(obj(raw).id), id);
      return { ...c, id, hasSecret: undefined };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  trip.transports = arr(v.transports)
    .slice(0, 100)
    .map((raw) => {
      const c = cleanTransport(raw);
      if (!c) return;
      const id = uid();
      if (str(obj(raw).id)) transportIds.set(str(obj(raw).id), id);
      return {
        ...c,
        id,
        hasSecret: undefined,
        passengers: c.passengers?.map((p) => maps.people.get(p)).filter((p): p is string => Boolean(p)),
        reservationId: c.reservationId ? maps.reservationIds.get(c.reservationId) : undefined,
        documentIds: c.documentIds?.map((d) => maps.documentIds.get(d)).filter((d): d is string => Boolean(d)),
        road: c.road ? { ...c.road, vehicleIds: c.road.vehicleIds?.map((x) => vehicleIds.get(x)).filter((x): x is string => Boolean(x)) } : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  // Expenses were read with their old links.
  trip.expenses = trip.expenses.map((x) => {
    const transportId = x.transportId ? transportIds.get(x.transportId) : undefined;
    const vehicleId = x.vehicleId ? vehicleIds.get(x.vehicleId) : undefined;
    return { ...x, transportId, vehicleId, costKey: transportId || vehicleId ? x.costKey : undefined };
  });
  // Reservations and documents: wallet category and links.
  const rawReservations = new Map(arr(v.reservations).map(obj).map((r) => [str(r.id), r]));
  trip.reservations = trip.reservations.map((r) => {
    const old = [...maps.reservationIds].find(([, n]) => n === r.id)?.[0];
    const raw = old ? rawReservations.get(old) : undefined;
    if (!raw) return r;
    return {
      ...r,
      category: isWalletCategory(raw.category) ? raw.category : undefined,
      transportId: transportIds.get(str(raw.transportId)),
      vehicleId: vehicleIds.get(str(raw.vehicleId)),
    };
  });
  const rawDocs = new Map(arr(v.documents).map(obj).map((d) => [str(d.id), d]));
  trip.documents = (trip.documents || []).map((d) => {
    const old = [...maps.documentIds].find(([, n]) => n === d.id)?.[0];
    const raw = old ? rawDocs.get(old) : undefined;
    if (!raw) return d;
    const day = num(raw.day);
    return {
      ...d,
      category: isWalletCategory(raw.category) ? raw.category : undefined,
      day: day && Number.isInteger(day) && day >= 1 && day <= 3660 ? day : undefined,
      transportId: transportIds.get(str(raw.transportId)),
      stayId: maps.stayIds.get(str(raw.stayId)),
      vehicleId: vehicleIds.get(str(raw.vehicleId)),
    };
  });
  trip.packing = cleanPacking(v.packing).map((x) => ({ ...x, id: uid(), travelerId: x.travelerId ? maps.people.get(x.travelerId) : undefined }));
  const refs = new Map([...transportIds, ...vehicleIds, ...maps.stayIds, ...maps.activityIds]);
  trip.reminders = cleanReminders(v.reminders).map((r) => ({ ...r, id: uid(), refId: r.refId ? refs.get(r.refId) : undefined }));
  trip.prep = cleanPrep(v.prep);
  trip.carComparison = cleanComparison(v.carComparison);
}
