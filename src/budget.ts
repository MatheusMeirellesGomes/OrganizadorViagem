/*
 * Trip money (Fase 4). Values are kept as typed by the person (major units,
 * e.g. 12.5 EUR) for compatibility with existing trips and backups, and every
 * calculation is done in integer minor units (cents), so splits and totals
 * never suffer from floating point errors.
 */

export type ExpenseStatus = "planned" | "reserved" | "partial" | "paid" | "cancelled";
export const statusLabels: Record<ExpenseStatus, string> = {
  planned: "Previsto",
  reserved: "Reservado",
  partial: "Parcialmente pago",
  paid: "Pago",
  cancelled: "Cancelado",
};
export const expenseCategories: Record<string, string> = {
  flights: "Passagens",
  lodging: "Hospedagens",
  car_rental: "Aluguel de veículos",
  fuel: "Combustível",
  tolls: "Pedágios",
  parking: "Estacionamentos",
  transit: "Transporte público",
  food: "Alimentação",
  tickets: "Ingressos",
  shopping: "Compras",
  insurance: "Seguros",
  other: "Outros gastos",
};

export type Participant = { id: string; name: string; group?: string };
export type SplitMode = "equal" | "shares" | "percent" | "amounts";
export type Split = {
  mode: SplitMode;
  /** Who takes part in the cost (not who paid). */
  participants: string[];
  /** shares: weights (2 for a couple); percent: 0-100; amounts: major units. */
  values?: Record<string, number>;
};
export type Conversion = { currency: string; rate: number; date: string; source: string };

export type Expense = {
  id: string;
  title: string;
  /** Amount actually paid so far (major units). Older trips only have this. */
  amount: number;
  currency: string;
  /** Planned amount (major units). Never counted as spent. */
  estimate?: number;
  status?: ExpenseStatus;
  category?: string;
  date?: string;
  day?: number;
  payerId?: string;
  split?: Split;
  notes?: string;
  receiptDocumentId?: string;
  activityId?: string;
  stayId?: string;
  reservationId?: string;
  /** Etapa 16: cost of a transport or vehicle; one expense per link and key. */
  transportId?: string;
  vehicleId?: string;
  costKey?: import("./journey/types").CostKey;
  /** Rate to the trip's reference currency, kept with its date and source. */
  conversion?: Conversion;
};

export type Settlement = {
  id: string;
  from: string;
  to: string;
  /** Major units, in `currency`. */
  amount: number;
  currency: string;
  date: string;
  done: boolean;
};

/** Number of decimals of a currency (EUR 2, JPY 0...). */
export function decimals(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
export const isCurrency = (c: string) => {
  if (!/^[A-Z]{3}$/.test(c)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: c });
    return true;
  } catch {
    return false;
  }
};
export const toMinor = (major: number, currency: string) => Math.round(major * 10 ** decimals(currency));
export const toMajor = (minor: number, currency: string) => minor / 10 ** decimals(currency);

/** Older expenses without status were money already spent. */
export const statusOf = (x: Expense): ExpenseStatus => x.status ?? "paid";

/** Paid so far, in minor units (planned and cancelled count as zero). */
export function paidMinor(x: Expense): number {
  const s = statusOf(x);
  return s === "paid" || s === "partial" ? toMinor(x.amount, x.currency) : 0;
}
/** Planned total, in minor units (cancelled counts as zero). */
export function plannedMinor(x: Expense): number {
  if (statusOf(x) === "cancelled") return 0;
  return toMinor(x.estimate ?? x.amount, x.currency);
}

/**
 * Splits `total` minor units among participants. The parts always add up to
 * the total: leftover cents go to the largest remainders (ties: list order).
 */
export function allocate(total: number, weights: { id: string; weight: number }[]): Record<string, number> {
  const valid = weights.filter((w) => w.weight > 0);
  const sum = valid.reduce((s, w) => s + w.weight, 0);
  const result: Record<string, number> = Object.fromEntries(weights.map((w) => [w.id, 0]));
  if (!valid.length || sum <= 0) return result;
  const raw = valid.map((w) => ({ id: w.id, exact: (total * w.weight) / sum }));
  let given = 0;
  for (const r of raw) {
    result[r.id] = Math.floor(r.exact);
    given += result[r.id];
  }
  const order = [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)));
  for (let i = 0; given < total; i = (i + 1) % order.length) {
    result[order[i].id]++;
    given++;
  }
  return result;
}

/** How much of the expense each participant owes, in minor units. */
export function shares(x: Expense, minor: number, everyone: string[]): Record<string, number> {
  const split = x.split ?? { mode: "equal" as const, participants: everyone };
  const people = split.participants.length ? split.participants : everyone;
  if (split.mode === "amounts") {
    const parts = Object.fromEntries(people.map((p) => [p, toMinor(split.values?.[p] ?? 0, x.currency)]));
    const sum = Object.values(parts).reduce((s, v) => s + v, 0);
    if (sum !== minor) throw new Error("A soma dos valores por pessoa não bate com o total da despesa.");
    return parts;
  }
  if (split.mode === "percent") {
    const sum = people.reduce((s, p) => s + (split.values?.[p] ?? 0), 0);
    if (Math.abs(sum - 100) > 0.001) throw new Error("As porcentagens precisam somar 100%.");
  }
  const weight = (p: string) => (split.mode === "equal" ? 1 : split.values?.[p] ?? 0);
  return allocate(minor, people.map((p) => ({ id: p, weight: weight(p) })));
}

export type Balance = { id: string; paid: number; owes: number; balance: number };

/**
 * Per currency: what each person paid, what each person owes (their part of
 * the paid expenses) and the balance. Done reimbursements count as payments.
 */
export function balances(expenses: Expense[], settlements: Settlement[], people: string[], currency: string): Balance[] {
  const b = new Map(people.map((p) => [p, { id: p, paid: 0, owes: 0, balance: 0 }]));
  for (const x of expenses) {
    if (x.currency !== currency) continue;
    const minor = paidMinor(x);
    if (!minor || !x.payerId || !b.has(x.payerId)) continue;
    b.get(x.payerId)!.paid += minor;
    for (const [p, part] of Object.entries(shares(x, minor, people))) if (b.has(p)) b.get(p)!.owes += part;
  }
  for (const s of settlements) {
    if (!s.done || s.currency !== currency || !b.has(s.from) || !b.has(s.to)) continue;
    const minor = toMinor(s.amount, currency);
    b.get(s.from)!.paid += minor;
    b.get(s.to)!.paid -= minor;
  }
  for (const v of b.values()) v.balance = v.paid - v.owes;
  return [...b.values()];
}

/** Fewest transfers that settle all balances (minor units). Sum of balances must be zero. */
export function suggestTransfers(list: Balance[]): { from: string; to: string; amount: number }[] {
  const debtors = list.filter((x) => x.balance < 0).map((x) => ({ id: x.id, v: -x.balance }));
  const creditors = list.filter((x) => x.balance > 0).map((x) => ({ id: x.id, v: x.balance }));
  debtors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  creditors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (!debtors[i].v) i++;
    if (!creditors[j].v) j++;
  }
  return out;
}

/** Value in the reference currency, only when a rate was recorded. */
export function converted(minorOrig: number, x: Pick<Expense, "currency" | "conversion">, reference: string): number | undefined {
  if (x.currency === reference) return minorOrig;
  if (!x.conversion || x.conversion.currency !== reference || !(x.conversion.rate > 0)) return;
  return toMinor(toMajor(minorOrig, x.currency) * x.conversion.rate, reference);
}

export type Summary = {
  currency: string;
  planned: number;
  spent: number;
  budget?: number;
  available?: number;
  byCategory: Record<string, { planned: number; spent: number }>;
  byDay: Record<string, number>;
  byParticipant: Record<string, number>;
  /** Expenses in other currencies without a recorded rate (not included). */
  unconverted: Expense[];
};

export function summarize(
  expenses: Expense[],
  reference: string,
  options: { budget?: { amount: number; currency: string }; people?: string[]; filter?: (x: Expense) => boolean } = {},
): Summary {
  const s: Summary = { currency: reference, planned: 0, spent: 0, byCategory: {}, byDay: {}, byParticipant: {}, unconverted: [] };
  const people = options.people ?? [];
  for (const x of expenses) {
    if (options.filter && !options.filter(x)) continue;
    const planned = converted(plannedMinor(x), x, reference);
    const spent = converted(paidMinor(x), x, reference);
    if (planned === undefined || spent === undefined) {
      if (statusOf(x) !== "cancelled") s.unconverted.push(x);
      continue;
    }
    s.planned += planned;
    s.spent += spent;
    const c = x.category ?? "other";
    const cat = (s.byCategory[c] ||= { planned: 0, spent: 0 });
    cat.planned += planned;
    cat.spent += spent;
    const dayKey = x.date ?? (x.day ? "day:" + x.day : "none");
    s.byDay[dayKey] = (s.byDay[dayKey] ?? 0) + spent;
    if (spent && people.length) {
      try {
        for (const [p, part] of Object.entries(shares({ ...x, currency: reference, split: x.split && x.split.mode === "amounts" ? undefined : x.split }, spent, people)))
          s.byParticipant[p] = (s.byParticipant[p] ?? 0) + part;
      } catch {
        /* inconsistent split: not counted per person */
      }
    }
  }
  if (options.budget && options.budget.currency === reference) {
    s.budget = toMinor(options.budget.amount, reference);
    s.available = s.budget - s.spent;
  }
  return s;
}
