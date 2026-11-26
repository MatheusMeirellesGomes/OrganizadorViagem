import { uid, type Trip } from "../model";
import type { Expense } from "../budget";
import type { Transport } from "../journey/types";
import { saveTransport, transportTitle } from "../journey/transport";
import { saveVehicle } from "../journey/vehicles";
import { setBooking } from "./central";

/*
 * Importar confirmação: lê o texto colado de um e-mail ou PDF de reserva
 * (voo, hotel ou carro) e sugere os campos. Tudo acontece neste aparelho, sem
 * enviar o texto para nenhum serviço. A pessoa revisa antes de salvar, e o
 * código da reserva nunca é copiado para a viagem (ele fica no campo
 * protegido, se a pessoa quiser).
 */

export type ImportedLeg = { from: string; to: string; departDate: string; departTime: string; arriveDate: string; arriveTime: string; carrier?: string; number?: string };
export type Imported = {
  kind: "flight" | "stay" | "car" | "unknown";
  legs: ImportedLeg[];
  stay?: { name: string; address?: string; city?: string; start: string; end: string; checkInTime?: string; checkOutTime?: string };
  car?: { company?: string; pickupPlace?: string; pickupDate?: string; pickupTime?: string; dropoffPlace?: string; dropoffDate?: string; dropoffTime?: string };
  price?: { amount: number; currency: string };
  codeFound: boolean;
};

const months: Record<string, number> = {};
[
  ["jan", "janeiro", "january", "enero", "ene"],
  ["fev", "fevereiro", "feb", "february", "febrero"],
  ["mar", "marco", "march", "marzo"],
  ["abr", "abril", "apr", "april"],
  ["mai", "maio", "may", "mayo"],
  ["jun", "junho", "june", "junio"],
  ["jul", "julho", "july", "julio"],
  ["ago", "agosto", "aug", "august"],
  ["set", "setembro", "sep", "sept", "september", "septiembre"],
  ["out", "outubro", "oct", "october", "octubre"],
  ["nov", "novembro", "november", "noviembre"],
  ["dez", "dezembro", "dec", "december", "dic", "diciembre"],
].forEach((names, i) => names.forEach((n) => (months[n] = i + 1)));

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const pad = (n: number) => String(n).padStart(2, "0");
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100;
const year4 = (y: string | undefined, ref: number) => (!y ? ref : y.length === 2 ? 2000 + Number(y) : Number(y));

/** Datas do texto, na ordem em que aparecem. */
export function findDates(text: string, refYear = new Date().getFullYear()): { iso: string; at: number }[] {
  const t = strip(text).toLowerCase();
  const out: { iso: string; at: number }[] = [];
  const push = (y: number, m: number, d: number, at: number) => {
    if (valid(y, m, d) && !out.some((x) => x.at === at)) out.push({ iso: `${y}-${pad(m)}-${pad(d)}`, at });
  };
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(+m[1], +m[2], +m[3], m.index!);
  for (const m of t.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) push(year4(m[3], refYear), +m[2], +m[1], m.index!);
  const name = Object.keys(months).sort((a, b) => b.length - a.length).join("|");
  // 10 de marco de 2027 · 10 mar 2027 · 10-mar-27
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:\\s+de|[\\s-]+)\\s*(${name})\\.?(?:(?:\\s+de|,|[\\s-])\\s*(\\d{4}|\\d{2}(?!:)))?\\b`, "g"))) push(year4(m[3], refYear), months[m[2]], +m[1], m.index!);
  // March 10, 2027
  for (const m of t.matchAll(new RegExp(`\\b(${name})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?\\b`, "g"))) push(year4(m[3], refYear), months[m[1]], +m[2], m.index!);
  return out.sort((a, b) => a.at - b.at);
}

export function findTimes(text: string): { hhmm: string; at: number }[] {
  return [...text.matchAll(/\b([01]?\d|2[0-3])\s?[:h]\s?([0-5]\d)\b/g)].map((m) => ({ hhmm: `${pad(+m[1])}:${m[2]}`, at: m.index! }));
}

const notAirports = new Set("BRL USD EUR GBP ARS CLP JPY CHF CAD AUD MXN CPF RG PNR CNH TAP NAO SIM THE AND FOR VOO VOOS IDA ATE DAS DOS PAX ADT CHD INF UTC GMT KG CEP RUA AVE SUL NOR".split(" "));
function airports(block: string): string[] {
  const found: { code: string; at: number }[] = [];
  for (const m of block.matchAll(/\(([A-Z]{3})\)/g)) found.push({ code: m[1], at: m.index! });
  for (const m of block.matchAll(/\b([A-Z]{3})\s*(?:→|->|–|—|-|>|para|to|a)\s*([A-Z]{3})\b/g)) {
    found.push({ code: m[1], at: m.index! });
    found.push({ code: m[2], at: m.index! + m[0].length - 3 });
  }
  // Sem parênteses nem setas: códigos soltos de 3 letras (GRU 22:00 → LIS 11:15).
  if (found.filter((x) => !notAirports.has(x.code)).length < 2)
    for (const m of block.matchAll(/(?<![A-Za-z])([A-Z]{3})(?![A-Za-z])/g)) found.push({ code: m[1], at: m.index! });
  return found
    .filter((x) => !notAirports.has(x.code))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.code)
    .filter((c, i, a) => c !== a[i - 1]);
}

const carriers = /\b(?:voo|flight|vuelo|vôo)?\s*\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4})\b/g;
const companies = ["Localiza", "Movida", "Unidas", "Foco", "Hertz", "Avis", "Budget", "Europcar", "Sixt", "Enterprise", "Alamo", "National", "Thrifty", "Dollar", "Rentcars", "Goldcar", "Centauro", "Record"];

function near<T extends { at: number }>(text: string, words: RegExp, list: T[], span = 90): T | undefined {
  const k = words.exec(strip(text).toLowerCase());
  if (!k) return undefined;
  return list.find((x) => x.at >= k.index && x.at <= k.index + k[0].length + span);
}

function price(text: string): Imported["price"] {
  const symbols: Record<string, string> = { "R$": "BRL", "€": "EUR", "US$": "USD", "U$": "USD", "£": "GBP", BRL: "BRL", EUR: "EUR", USD: "USD", GBP: "GBP", "$": "USD" };
  const re = /(total[^\n\d]{0,40}?)?(R\$|US\$|U\$|€|£|\$|BRL|EUR|USD|GBP)\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/gi;
  let best: Imported["price"];
  let bestTotal = false;
  for (const m of text.matchAll(re)) {
    const raw = m[3].replace(/\s/g, "");
    const n = /,\d{2}$/.test(raw) ? Number(raw.replace(/\./g, "").replace(",", ".")) : Number(raw.replace(/,/g, ""));
    if (!(n > 0)) continue;
    const isTotal = Boolean(m[1]);
    if (!best || isTotal || (!bestTotal && n > best.amount)) {
      best = { amount: n, currency: symbols[m[2].toUpperCase()] ?? symbols[m[2]] ?? "USD" };
      bestTotal = bestTotal || isTotal;
    }
  }
  return best;
}

export function parseConfirmation(text: string, refYear = new Date().getFullYear()): Imported {
  const clean = text.replace(/\r/g, "").slice(0, 20000);
  const low = strip(clean).toLowerCase();
  const codeFound = /(localizador|codigo (da|de) reserva|booking (reference|code)|confirmation (number|code)|numero (da|de) reserva|numero de confirma|pnr|record locator)/.test(low);
  const result: Imported = { kind: "unknown", legs: [], price: price(clean), codeFound };

  // Voo: um bloco por número de voo.
  const isFlight = /(voo|flight|vuelo|embarque|boarding|aeroporto|airport|aeropuerto|bagagem|baggage)/.test(low);
  const nums = isFlight ? [...clean.matchAll(carriers)].filter((m) => /[A-Z]/.test(m[1]) && !notAirports.has(m[1] + m[2])) : [];
  if (isFlight) {
    const starts = nums.length ? nums.map((m) => m.index!) : [0];
    starts.forEach((s, i) => {
      const block = clean.slice(i === 0 ? Math.max(0, s - 200) : s, starts[i + 1] ?? clean.length);
      const codes = airports(block);
      const dates = findDates(block, refYear);
      const times = findTimes(block);
      if (codes.length < 2 || !dates.length) return;
      const departTime = times[0]?.hhmm ?? "";
      const arriveTime = times[1]?.hhmm ?? "";
      let arriveDate = dates[1]?.iso ?? dates[0].iso;
      if (!dates[1] && departTime && arriveTime && arriveTime < departTime) arriveDate = new Date(Date.parse(dates[0].iso + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
      const n = nums[i];
      result.legs.push({ from: codes[0], to: codes[1], departDate: dates[0].iso, departTime, arriveDate, arriveTime, carrier: n?.[1], number: n?.[2] });
    });
    if (result.legs.length) result.kind = "flight";
  }

  if (result.kind === "unknown" && /(check-?in|entrada)/.test(low) && /(check-?out|saida)/.test(low)) {
    const dates = findDates(clean, refYear);
    const times = findTimes(clean);
    const start = near(clean, /check-?in|entrada/, dates) ?? dates[0];
    const end = near(clean, /check-?out|saida/, dates) ?? dates[1];
    if (start && end) {
      const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
      const name = lines.find((l) => /(hotel|pousada|hostel|resort|inn|suites|apart|guest ?house|albergue|b&b)/i.test(l) && l.length <= 90) ?? lines[0] ?? "Hospedagem";
      const addr = lines.find((l) => /^(endere[cç]o|address|direcci[oó]n)\s*:/i.test(l));
      result.kind = "stay";
      result.stay = {
        name: name.replace(/^(hotel|hospedagem|propriedade|property)\s*:\s*/i, "").slice(0, 90),
        address: addr?.replace(/^[^:]+:\s*/, "").slice(0, 160),
        start: start.iso,
        end: end.iso,
        checkInTime: near(clean, /check-?in|entrada/, times)?.hhmm,
        checkOutTime: near(clean, /check-?out|saida/, times)?.hhmm,
      };
    }
  }

  if (result.kind === "unknown" && /(retirada|pick-?up|recogida|aluguel de carro|car rental|alquiler)/.test(low)) {
    const dates = findDates(clean, refYear);
    const times = findTimes(clean);
    const company = companies.find((c) => new RegExp(`\\b${c}\\b`, "i").test(clean));
    const lines = clean.split("\n").map((l) => l.trim());
    const placeAfter = (re: RegExp) => {
      const line = lines.find((x) => re.test(strip(x).toLowerCase()));
      if (!line || !line.includes(":")) return undefined;
      const v = line.slice(line.indexOf(":") + 1).split(/\s[-–|]\s|\d{1,2}[/.]\d|\d{4}-\d{2}/)[0].trim().replace(/[,;]$/, "");
      return v ? v.slice(0, 120) : undefined;
    };
    result.kind = "car";
    result.car = {
      company,
      pickupDate: (near(clean, /retirada|pick-?up|recogida/, dates) ?? dates[0])?.iso,
      pickupTime: near(clean, /retirada|pick-?up|recogida/, times)?.hhmm,
      dropoffDate: (near(clean, /devolucao|drop-?off|return|devolucion/, dates) ?? dates[1])?.iso,
      dropoffTime: near(clean, /devolucao|drop-?off|return|devolucion/, times)?.hhmm,
      pickupPlace: placeAfter(/^(local de retirada|pick-?up location|lugar de recogida)/),
      dropoffPlace: placeAfter(/^(local de devolucao|drop-?off location|return location|lugar de devolucion)/),
    };
  }
  return result;
}

/** Coloca na viagem o que a pessoa revisou: voo, hospedagem ou carro, e o valor como despesa prevista. */
export function applyImport(trip: Trip, data: Imported, options: { expense?: boolean } = {}): Trip {
  let next = trip;
  let ref: { key: string; link: Partial<Expense>; title: string; category: string } | undefined;
  if (data.kind === "flight") {
    if (!data.legs.length) throw new Error("Confira os trechos do voo.");
    const id = uid();
    const t: Transport = {
      id,
      kind: "flight",
      legs: data.legs.map((l) => ({ id: uid(), from: { name: l.from, code: /^[A-Z]{3}$/.test(l.from) ? l.from : undefined }, to: { name: l.to, code: /^[A-Z]{3}$/.test(l.to) ? l.to : undefined }, departDate: l.departDate, departTime: l.departTime, arriveDate: l.arriveDate, arriveTime: l.arriveTime, carrier: l.carrier || undefined, number: l.number || undefined })),
    };
    next = saveTransport(next, t);
    ref = { key: "t:" + id, link: { transportId: id, costKey: "fare" }, title: transportTitle(t), category: "flights" };
  } else if (data.kind === "stay" && data.stay) {
    const s = data.stay;
    if (!s.name.trim() || !s.start || !s.end || s.end <= s.start) throw new Error("Confira o nome e as datas de entrada e saída.");
    const id = uid();
    next = { ...next, stays: [...(next.stays ?? []), { id, name: s.name.trim(), address: s.address ?? "", city: s.city ?? "", start: s.start, end: s.end, checkInTime: s.checkInTime ?? "", checkOutTime: s.checkOutTime ?? "", url: "", confirmation: "", notes: "" }] };
    ref = { key: "s:" + id, link: { stayId: id }, title: s.name.trim(), category: "lodging" };
  } else if (data.kind === "car" && data.car) {
    const id = uid();
    next = saveVehicle(next, { id, ownership: "rental", label: data.car.company ? `Carro ${data.car.company}` : undefined, rental: { ...data.car } });
    ref = { key: "v:" + id, link: { vehicleId: id, costKey: "rental" }, title: data.car.company ? `Carro ${data.car.company}` : "Carro alugado", category: "car_rental" };
  } else throw new Error("Não reconhecemos uma reserva nesse texto.");

  next = setBooking(next, ref.key, { status: "reserved" });
  if (options.expense && data.price && data.price.amount > 0) {
    const e: Expense = { id: uid(), title: ref.title, amount: 0, estimate: data.price.amount, currency: data.price.currency, status: "reserved", category: ref.category, ...ref.link };
    next = { ...next, expenses: [...next.expenses, e] };
  }
  return next;
}
