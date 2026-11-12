import type { Activity, Trip } from "./model";
import type { Expense } from "./budget";

/*
 * Travel Mode changes made without internet in an account (Fase 5).
 * Each change is stored as an operation with the value it replaced. When the
 * connection comes back, operations are applied to the newest version of the
 * trip from the account: a field changed meanwhile on another device is kept
 * and reported as a conflict instead of being overwritten.
 */

type Field = "done" | "status" | "time" | "day" | "notes" | "history";
const fields: Field[] = ["done", "status", "time", "day", "notes", "history"];

export type Op =
  | { id: string; tripId: string; at: string; kind: "activity"; activityId: string; title: string; field: Field; before: unknown; after: unknown }
  | { id: string; tripId: string; at: string; kind: "expense"; expense: Expense };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Operations that turn `before` into `after` (only Travel Mode fields and new expenses). */
export function diffOps(before: Trip, after: Trip): Op[] {
  const at = new Date().toISOString();
  const ops: Op[] = [];
  const old = new Map(before.activities.map((a) => [a.id, a]));
  for (const a of after.activities) {
    const b = old.get(a.id);
    if (!b) continue;
    for (const f of fields)
      if (!same(b[f], a[f]))
        ops.push({ id: crypto.randomUUID(), tripId: after.id, at, kind: "activity", activityId: a.id, title: a.title, field: f, before: b[f], after: a[f] });
  }
  const known = new Set(before.expenses.map((x) => x.id));
  for (const x of after.expenses) if (!known.has(x.id)) ops.push({ id: crypto.randomUUID(), tripId: after.id, at, kind: "expense", expense: x });
  return ops;
}

/** True when `after` only differs from `before` in Travel Mode fields and new expenses. */
export function onlyQueueable(before: Trip, after: Trip): boolean {
  const strip = (t: Trip) => ({
    ...t,
    activities: t.activities.map((a) => Object.fromEntries(Object.entries(a).filter(([k]) => !fields.includes(k as Field)))),
    expenses: undefined,
  });
  const kept = before.expenses.every((x) => after.expenses.some((y) => y.id === x.id && same(x, y)));
  return same(strip(before), strip(after)) && kept;
}

export type Conflict = { title: string; field?: string; reason: "removed" | "changed" };

export function applyOps(trip: Trip, ops: Op[]): { trip: Trip; conflicts: Conflict[]; applied: number } {
  let activities = [...trip.activities];
  const expenses = [...trip.expenses];
  const conflicts: Conflict[] = [];
  let applied = 0;
  for (const op of ops) {
    if (op.tripId !== trip.id) continue;
    if (op.kind === "expense") {
      if (!expenses.some((x) => x.id === op.expense.id)) {
        expenses.push(op.expense);
        applied++;
      }
      continue;
    }
    const i = activities.findIndex((a) => a.id === op.activityId);
    if (i < 0) {
      if (!conflicts.some((c) => c.title === op.title && c.reason === "removed")) conflicts.push({ title: op.title, reason: "removed" });
      continue;
    }
    const current = activities[i][op.field];
    if (same(current, op.after)) continue;
    // History only grows: keep both devices' entries.
    if (op.field === "history") {
      const merged = [...((current as Activity["history"]) ?? [])];
      for (const h of (op.after as Activity["history"]) ?? []) if (!merged.some((m) => same(m, h))) merged.push(h);
      activities = activities.map((a, n) => (n === i ? { ...a, history: merged.slice(-50) } : a));
      applied++;
      continue;
    }
    if (!same(current, op.before)) {
      conflicts.push({ title: op.title, field: op.field, reason: "changed" });
      continue;
    }
    activities = activities.map((a, n) => (n === i ? { ...a, [op.field]: op.after } : a));
    applied++;
  }
  return { trip: { ...trip, activities, expenses }, conflicts, applied };
}

const KEY = "gomes-pendentes-v1:";
export function readOutbox(userId: string): Op[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + userId) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function writeOutbox(userId: string, ops: Op[]) {
  try {
    if (ops.length) localStorage.setItem(KEY + userId, JSON.stringify(ops.slice(-500)));
    else localStorage.removeItem(KEY + userId);
  } catch {
    /* no storage: changes stay only on screen */
  }
}
