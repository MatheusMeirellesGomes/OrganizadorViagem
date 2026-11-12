/*
 * Small reader for OpenStreetMap opening_hours ("Mo-Fr 08:00-20:00; Sa 09:00-14:00").
 * Covers the common forms: day ranges and lists, several time ranges, times
 * past midnight, "24/7" and "off". Anything else (months, holidays, sunrise,
 * week numbers...) is not guessed: the text is shown as registered and the
 * place is not used by "open now" or meal filters.
 */

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
/** Minutes from Monday 00:00; one week = 10080. */
export type Week = [number, number][];
export const WEEK = 7 * 1440;

function parseDays(text: string): number[] | undefined {
  const days = new Set<number>();
  for (const part of text.split(",")) {
    const m = part.trim().match(/^([A-Z][a-z])(?:-([A-Z][a-z]))?$/);
    if (!m) return;
    const a = DAYS.indexOf(m[1]),
      b = m[2] ? DAYS.indexOf(m[2]) : a;
    if (a < 0 || b < 0) return;
    for (let d = a; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === b) break;
    }
  }
  return [...days];
}

function parseTimes(text: string): [number, number][] | undefined {
  const out: [number, number][] = [];
  for (const part of text.split(",")) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/);
    if (!m) return;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (start > 1440 || end > 48 * 60 || Number(m[2]) > 59 || Number(m[4]) > 59) return;
    if (end <= start) end += 1440; // past midnight
    out.push([start, end]);
  }
  return out;
}

/** Weekly open intervals, or undefined when the text uses forms not covered here. */
export function parseOpeningHours(value: string | undefined): Week | undefined {
  if (!value) return;
  const text = value.trim();
  if (text === "24/7") return [[0, WEEK]];
  const perDay: ([number, number][] | undefined)[] = Array(7).fill(undefined);
  for (const raw of text.split(/;|\|\|/)) {
    const rule = raw.trim();
    if (!rule) continue;
    const m = rule.match(/^([A-Z][a-z](?:[-,][A-Z][a-z])*)?\s*(.*)$/);
    if (!m) return;
    const days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return;
    const rest = m[2].trim();
    let times: [number, number][] | undefined;
    if (/^(off|closed)$/i.test(rest)) times = [];
    else if (rest === "24/7" || rest === "00:00-24:00") times = [[0, 1440]];
    else times = parseTimes(rest);
    if (!times) return;
    for (const d of days) perDay[d] = times; // later rules replace earlier ones
  }
  if (perDay.every((d) => d === undefined)) return;
  const week: Week = [];
  perDay.forEach((times, d) => {
    for (const [s, e] of times ?? []) week.push([d * 1440 + s, d * 1440 + e]);
  });
  return week;
}

/** Minute of the week (Monday 00:00 = 0) for a date in local time. */
export function minuteOfWeek(date: Date) {
  return ((date.getDay() + 6) % 7) * 1440 + date.getHours() * 60 + date.getMinutes();
}

export function isOpenAt(week: Week, minute: number) {
  return week.some(([s, e]) => (minute >= s && minute < e) || (e > WEEK && minute + WEEK < e));
}

/** Open at some moment between `from` and `to` (minutes of the day) on any day. */
export function opensDuring(week: Week, from: number, to: number) {
  for (let d = 0; d < 7; d++) {
    const a = d * 1440 + from,
      b = d * 1440 + to;
    if (week.some(([s, e]) => s < b && e > a)) return true;
  }
  return false;
}
