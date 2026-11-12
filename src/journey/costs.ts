import { uid, type Trip } from "../model";
import { isCurrency, toMinor, type Expense, type ExpenseStatus } from "../budget";
import { costKeys, type CostKey, type TransportKind } from "./types";

/*
 * Costs of transports and vehicles live in the trip expenses (the budget),
 * linked by transportId/vehicleId + costKey. Setting a cost again updates the
 * same expense, so nothing is ever counted twice. Nothing becomes "paid"
 * unless the person typed a paid amount.
 */

export type CostRef = { transportId: string; vehicleId?: undefined } | { vehicleId: string; transportId?: undefined };

export const categoryFor = (key: CostKey, kind?: TransportKind): string =>
  key === "fare"
    ? kind === "flight"
      ? "flights"
      : "transit"
    : ({ rental: "car_rental", fuel: "fuel", tolls: "tolls", parking: "parking", insurance: "insurance" } as Record<string, string>)[key] ?? "other";

const same = (x: Expense, ref: CostRef, key: CostKey) =>
  x.costKey === key && (ref.transportId ? x.transportId === ref.transportId : x.vehicleId === ref.vehicleId);

export const linkedCost = (trip: Trip, ref: CostRef, key: CostKey) => trip.expenses.find((x) => same(x, ref, key));
export const linkedCosts = (trip: Trip, ref: CostRef) =>
  trip.expenses.filter((x) => (ref.transportId ? x.transportId === ref.transportId : x.vehicleId === ref.vehicleId));

export function statusFor(planned: number | undefined, paid: number | undefined, currency: string): ExpenseStatus {
  if (!paid) return "planned";
  return planned !== undefined && toMinor(paid, currency) < toMinor(planned, currency) ? "partial" : "paid";
}

/**
 * Creates or updates the expense of one cost. Both amounts undefined = the
 * value is unknown: an existing expense is kept as it is and none is created.
 */
export function setCost(
  trip: Trip,
  ref: CostRef,
  key: CostKey,
  input: { planned?: number; paid?: number; currency: string; title: string; date?: string; day?: number; kind?: TransportKind },
): Trip {
  const currency = input.currency.toUpperCase();
  if (!isCurrency(currency)) throw new Error("Moeda inválida.");
  const ok = (n?: number) => (n !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined);
  const planned = ok(input.planned);
  const paid = ok(input.paid);
  if (planned === undefined && paid === undefined) return trip;
  const existing = linkedCost(trip, ref, key);
  if (existing && existing.currency !== currency && existing.amount > 0 && paid === undefined)
    throw new Error("Este custo já tem valor pago em outra moeda. Edite-o no orçamento.");
  const base: Expense = existing ?? {
    id: uid(),
    title: `${costKeys[key]}: ${input.title}`.slice(0, 120),
    amount: 0,
    currency,
    category: categoryFor(key, input.kind),
    date: input.date,
    day: input.day,
    ...ref,
    costKey: key,
  };
  const next: Expense = {
    ...base,
    currency,
    estimate: planned ?? base.estimate,
    amount: paid ?? base.amount,
  };
  next.status = base.status === "cancelled" ? "cancelled" : next.amount > 0 ? statusFor(next.estimate, next.amount, currency) : (existing?.status ?? "planned");
  return { ...trip, expenses: existing ? trip.expenses.map((x) => (x.id === existing.id ? next : x)) : [...trip.expenses, next] };
}
