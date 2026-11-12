import { useEffect, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { t as tr, tf } from "../i18n";
import type { Trip } from "../model";
import { dueReminders, reminderKinds, remindAt, setReminderDone } from "./reminders";

const shownKey = "gomes-lembretes-avisados";
const shown = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(shownKey) || "[]");
  } catch {
    return [];
  }
};

/**
 * Due reminders of every trip, inside the app. With permission, also a
 * browser notification at the right time — only while the app is open.
 */
export function ReminderBanner({ trips, onOpen, onSave }: { trips: Trip[]; onOpen: (t: Trip) => void; onSave: (t: Trip) => Promise<boolean> }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(i);
  }, []);
  // Browser notifications for reminders that become due while the app is open.
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of trips)
      for (const r of t.reminders || []) {
        const wait = remindAt(r) - Date.now();
        if (r.done || wait < -60_000 || wait > 24 * 3600_000) continue;
        timers.push(
          setTimeout(() => {
            const seen = shown();
            if (seen.includes(r.id)) return;
            try {
              new Notification(tr(reminderKinds[r.kind]), { body: `${r.title} · ${t.title}`, tag: r.id });
              sessionStorage.setItem(shownKey, JSON.stringify([...seen, r.id].slice(-200)));
            } catch {
              // Notifications blocked: the banner still shows it.
            }
            setNow(Date.now());
          }, Math.max(0, wait)),
        );
      }
    return () => timers.forEach(clearTimeout);
  }, [trips]);

  const due = trips.flatMap((t) => dueReminders(t, now).map((r) => ({ t, r })));
  if (!due.length) return null;
  return (
    <section className="reminder-banner" aria-label={tr("Lembretes")} role="status">
      <BellRing size={18} aria-hidden="true" />
      <ul>
        {due.slice(0, 3).map(({ t, r }) => (
          <li key={r.id}>
            <button className="text-button" onClick={() => onOpen(t)}>
              <b>{tr(reminderKinds[r.kind])}</b> · {r.title} <small>({t.title})</small>
            </button>
            <button className="icon-button" onClick={() => onSave(setReminderDone(t, r.id))} aria-label={tr("Marcar como feito")}>
              <Check size={15} />
            </button>
          </li>
        ))}
      </ul>
      {due.length > 3 && <small>{tf("e mais {count}", { count: due.length - 3 })}</small>}
    </section>
  );
}
