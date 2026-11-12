import { uid, type Trip } from "../model";
import { isCurrency, toMajor, toMinor } from "../budget";
import { fuelKinds, type Vehicle } from "./types";

const text = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v: unknown, max = 80) => text(v, max) || undefined;
const num = (v: unknown, min: number, max: number) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return v !== "" && v !== undefined && v !== null && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const time = (v: unknown) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined);
const list = (v: unknown) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : [])
    .map((x) => text(x, 60))
    .filter(Boolean)
    .slice(0, 20);

export function cleanVehicle(v: unknown): Vehicle | undefined {
  const x = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  if (x.ownership !== "own" && x.ownership !== "rental") return;
  const r = (x.rental && typeof x.rental === "object" ? x.rental : {}) as Record<string, unknown>;
  const currency = text(r.currency, 3).toUpperCase();
  return {
    id: typeof x.id === "string" && x.id ? x.id : uid(),
    ownership: x.ownership,
    label: opt(x.label),
    make: opt(x.make, 40),
    model: opt(x.model, 40),
    year: num(x.year, 1950, 2100),
    category: opt(x.category, 40),
    fuel: typeof x.fuel === "string" && x.fuel in fuelKinds ? (x.fuel as Vehicle["fuel"]) : undefined,
    efficiency: num(x.efficiency, 0.5, 100),
    seats: num(x.seats, 1, 60),
    bags: num(x.bags, 0, 60),
    hasSecret: x.hasSecret === true || undefined,
    rental:
      x.ownership === "rental"
        ? {
            company: opt(r.company, 60),
            pickupPlace: opt(r.pickupPlace, 120),
            pickupDate: date(r.pickupDate),
            pickupTime: time(r.pickupTime),
            dropoffPlace: opt(r.dropoffPlace, 120),
            dropoffDate: date(r.dropoffDate),
            dropoffTime: time(r.dropoffTime),
            insurance: opt(r.insurance, 120),
            deductible: num(r.deductible, 0, 1e7),
            deposit: num(r.deposit, 0, 1e7),
            currency: isCurrency(currency) ? currency : undefined,
            drivers: list(r.drivers),
            countries: list(r.countries),
            winterEquipment: r.winterEquipment === true || undefined,
          }
        : undefined,
  };
}

export const vehicleName = (v: Vehicle) =>
  v.label || [v.make, v.model].filter(Boolean).join(" ") || (v.ownership === "rental" ? "Carro alugado" : "Carro próprio");

export function saveVehicle(trip: Trip, input: unknown): Trip {
  const v = cleanVehicle(input);
  if (!v) throw new Error("Escolha se o carro é próprio ou alugado.");
  const r = v.rental;
  if (r?.pickupDate && r.dropoffDate && (r.dropoffDate < r.pickupDate || (r.dropoffDate === r.pickupDate && r.pickupTime && r.dropoffTime && r.dropoffTime <= r.pickupTime)))
    throw new Error("A devolução está antes da retirada.");
  const all = trip.vehicles || [];
  return { ...trip, vehicles: all.some((x) => x.id === v.id) ? all.map((x) => (x.id === v.id ? v : x)) : [...all, v] };
}

/** Removes the vehicle; its expenses stay in the budget, unlinked. */
export function removeVehicle(trip: Trip, id: string): Trip {
  return {
    ...trip,
    vehicles: (trip.vehicles || []).filter((v) => v.id !== id),
    transports: (trip.transports || []).map((t) => (t.road?.vehicleIds?.includes(id) ? { ...t, road: { ...t.road, vehicleIds: t.road.vehicleIds.filter((x) => x !== id) } } : t)),
    expenses: trip.expenses.map((x) => (x.vehicleId === id ? { ...x, vehicleId: undefined, costKey: undefined } : x)),
    reservations: trip.reservations.map((r) => (r.vehicleId === id ? { ...r, vehicleId: undefined } : r)),
  };
}

export type ConsumptionUnit = "km_per_l" | "l_per_100km" | "kwh_per_100km";
export type FuelInput = { km: number; consumption: number; unit: ConsumptionUnit; price: number; currency: string };
export type FuelEstimate = { quantity: number; unit: "L" | "kWh"; cost: number; costMinor: number; currency: string };

/**
 * Litres (or kWh) needed and their cost. km/L: litres = km ÷ consumption.
 * L/100 km and kWh/100 km: quantity = km × consumption ÷ 100. Always an estimate.
 */
export function fuelEstimate(input: FuelInput): FuelEstimate {
  const { km, consumption, unit, price } = input;
  const currency = input.currency.toUpperCase();
  if (!(km > 0)) throw new Error("Informe a distância.");
  if (!(consumption > 0)) throw new Error("Informe o consumo médio.");
  if (!(price >= 0)) throw new Error("Informe o preço do combustível.");
  if (!isCurrency(currency)) throw new Error("Moeda inválida.");
  const quantity = unit === "km_per_l" ? km / consumption : (km * consumption) / 100;
  // Rounded once, at the end, in minor units.
  const costMinor = toMinor(quantity * price, currency);
  return { quantity: Math.round(quantity * 100) / 100, unit: unit === "kwh_per_100km" ? "kWh" : "L", cost: toMajor(costMinor, currency), costMinor, currency };
}

/* ---------- Comparing one big car with two smaller ones (or any mix) ---------- */

export type CarChoice = {
  label: string;
  /** Rental for the whole period, major units. Undefined = unknown. */
  rental?: number;
  /** km/L. Undefined = unknown. */
  efficiency?: number;
  seats?: number;
  bags?: number;
};
export type CarOption = { id: string; name: string; cars: CarChoice[]; comfort?: string };
export type Comparison = {
  currency: string;
  km?: number;
  fuelPrice?: number;
  /** Per car, for the whole trip. */
  tolls?: number;
  parkingPerDay?: number;
  days?: number;
  passengers?: number;
  bags?: number;
  /** People allowed to drive. */
  drivers?: number;
  options: CarOption[];
};

export type OptionResult = {
  id: string;
  name: string;
  /** Total in minor units, only when every value is known. */
  totalMinor?: number;
  /** Sum of the known parts. */
  knownMinor: number;
  parts: { rental: number; fuel: number; tolls: number; parking: number };
  missing: string[];
  seats?: number;
  bags?: number;
  seatsOk?: boolean;
  bagsOk?: boolean;
  driversOk?: boolean;
  perPersonMinor?: number;
};

/**
 * Totals per option. Unknown values are never treated as zero: the option is
 * marked incomplete and only the known part is shown. Two cars pay fuel,
 * tolls and parking twice and need two drivers.
 */
export function compareOptions(c: Comparison): { results: OptionResult[]; cheapest?: string } {
  const cur = c.currency;
  const results = c.options.map((o): OptionResult => {
    const missing = new Set<string>();
    const parts = { rental: 0, fuel: 0, tolls: 0, parking: 0 };
    for (const car of o.cars) {
      if (car.rental === undefined) missing.add("Aluguel");
      else parts.rental += toMinor(car.rental, cur);
      if (c.km === undefined || c.fuelPrice === undefined || car.efficiency === undefined) missing.add("Combustível");
      else parts.fuel += fuelEstimate({ km: c.km, consumption: car.efficiency, unit: "km_per_l", price: c.fuelPrice, currency: cur }).costMinor;
      if (c.tolls === undefined) missing.add("Pedágios");
      else parts.tolls += toMinor(c.tolls, cur);
      if (c.parkingPerDay === undefined || c.days === undefined) missing.add("Estacionamento");
      else parts.parking += toMinor(c.parkingPerDay * c.days, cur);
    }
    const knownMinor = parts.rental + parts.fuel + parts.tolls + parts.parking;
    const seats = o.cars.every((x) => x.seats !== undefined) ? o.cars.reduce((n, x) => n + x.seats!, 0) : undefined;
    const bags = o.cars.every((x) => x.bags !== undefined) ? o.cars.reduce((n, x) => n + x.bags!, 0) : undefined;
    const totalMinor = missing.size || !o.cars.length ? undefined : knownMinor;
    return {
      id: o.id,
      name: o.name,
      totalMinor,
      knownMinor,
      parts,
      missing: [...missing],
      seats,
      bags,
      seatsOk: seats !== undefined && c.passengers !== undefined ? seats >= c.passengers : undefined,
      bagsOk: bags !== undefined && c.bags !== undefined ? bags >= c.bags : undefined,
      driversOk: c.drivers !== undefined ? c.drivers >= o.cars.length : undefined,
      perPersonMinor: totalMinor !== undefined && c.passengers ? Math.round(totalMinor / c.passengers) : undefined,
    };
  });
  const valid = results.filter((r) => r.totalMinor !== undefined && r.seatsOk !== false && r.bagsOk !== false && r.driversOk !== false);
  const cheapest = valid.length ? valid.reduce((a, b) => (b.totalMinor! < a.totalMinor! ? b : a)).id : undefined;
  return { results, cheapest };
}

export const newOption = (name: string, cars: CarChoice[]): CarOption => ({ id: uid(), name, cars });
