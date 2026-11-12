import { describe, it, expect } from "vitest";
import { newTrip, type Trip, type Stay } from "./model";
import type { SavedPlace } from "./choices";
import { applyPlan, cluster, estimateTravel, orderStops, planAlternatives, planItinerary, toClock, type PlannerInput } from "./planner";

// Cenário de teste (não são dados reais de ninguém): Lisboa → Mérida → Madrid → Segóvia...
const stay = (id: string, name: string, start: string, end: string, lat: number, lng: number): Stay => ({
  id, name, address: "", city: name, start, end, checkInTime: "", checkOutTime: "", url: "", confirmation: "", notes: "", coordinates: { lat, lng },
});
const place = (id: string, name: string, lat: number, lng: number, category: string, tags: Record<string, string> = {}): SavedPlace => ({
  id, name, coordinates: { lat, lng }, category, address: "", city: "", country: "", source: "", retrievedAt: "", tags,
});
const trip = (): Trip =>
  newTrip({
    title: "Península 2027",
    start: "2027-01-23",
    end: "2027-02-02",
    stays: [
      stay("lis", "Hotel Lisboa", "2027-01-23", "2027-01-24", 38.7223, -9.1393),
      stay("mer", "Hotel Mérida", "2027-01-24", "2027-01-25", 38.9161, -6.3437),
      stay("mad", "Hotel Madrid", "2027-01-25", "2027-01-29", 40.4200, -3.7020),
      stay("seg", "Hotel Segóvia", "2027-01-29", "2027-01-30", 40.9481, -4.1184),
    ],
    activities: [
      { id: "fixo", title: "Visita guiada reservada", day: 3, time: "10:00", address: "", done: false, kind: "Passeio", coordinates: { lat: 40.4140, lng: -3.6920 } },
    ],
  });
const madrid = [
  place("wd:Q171517", "Palacio Real", 40.4180, -3.7142, "palace", { sitelinks: "46", fee: "yes" }),
  place("wd:Q849711", "Almudena", 40.4157, -3.7144, "place_of_worship", { sitelinks: "41", fee: "no" }),
  place("wd:Q1123493", "Plaza Mayor", 40.4155, -3.7074, "square", { sitelinks: "40" }),
  place("wd:Q160112", "Prado", 40.4138, -3.6921, "museum", { sitelinks: "80", fee: "yes", opening_hours: "Mo-Sa 10:00-20:00; Su 10:00-19:00" }),
  place("wd:Q1131807", "Retiro", 40.4153, -3.6844, "park", { sitelinks: "54", fee: "no" }),
  place("wd:Q193018", "Reina Sofía", 40.4086, -3.6943, "museum", { sitelinks: "60", opening_hours: "Mo,We-Sa 10:00-21:00; Su 10:00-14:30; Tu off" }),
];
const segovia = [
  place("wd:Q244947", "Aqueduto", 40.9479, -4.1181, "monument", { sitelinks: "60" }),
  place("wd:Q557337", "Alcázar", 40.9524, -4.1325, "castle", { sitelinks: "50" }),
  place("wd:Q1499912", "Catedral de Segóvia", 40.9503, -4.1250, "place_of_worship", { sitelinks: "30" }),
];
const belem = place("wd:Q215003", "Torre de Belém", 38.6916, -9.2160, "castle", { sitelinks: "70" });
const input = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  places: [...madrid, ...segovia, belem],
  days: [1, 2, 3, 4, 5, 6, 7],
  dayStart: "09:00",
  dayEnd: "19:00",
  mode: "transit",
  pace: "balanced",
  meals: [{ kind: "lunch", at: "13:00", minutes: 60 }],
  ...over,
});
const dayOf = (plan: ReturnType<typeof planItinerary>, id: string) => plan.days.find((d) => d.stops.some((s) => s.place.id === id))?.day;

describe("deslocamento e ordem", () => {
  it("estima tempo pela distância, nunca como rota real", () => {
    const short = estimateTravel({ lat: 40.418, lng: -3.7142 }, { lat: 40.4157, lng: -3.7144 }, "transit");
    expect(short.mode).toBe("walking"); // trechos curtos a pé
    const longer = estimateTravel({ lat: 40.418, lng: -3.7142 }, { lat: 40.4153, lng: -3.6844 }, "transit");
    expect(longer.minutes).toBeGreaterThan(10);
    expect(estimateTravel({ lat: 40, lng: -3 }, { lat: 40, lng: -3 }, "driving").minutes).toBe(0);
  });
  it("agrupa pontos próximos e evita idas e voltas", () => {
    const pts = [{ point: { lat: 0, lng: 0 } }, { point: { lat: 0, lng: 0.01 } }, { point: { lat: 5, lng: 5 } }, { point: { lat: 5, lng: 5.01 } }];
    const groups = cluster(pts, 2);
    expect(groups.map((g) => g.length).sort()).toEqual([2, 2]);
    const order = orderStops([{ point: { lat: 0, lng: 3 } }, { point: { lat: 0, lng: 1 } }, { point: { lat: 0, lng: 2 } }], { lat: 0, lng: 0 });
    expect(order.map((o) => o.point.lng)).toEqual([1, 2, 3]);
  });
});

describe("roteiro com várias cidades", () => {
  it("cada lugar vai para os dias da cidade certa, pela hospedagem da data", () => {
    const plan = planItinerary(trip(), input());
    expect(dayOf(plan, "wd:Q215003")).toBe(1); // Lisboa: 23/01
    for (const p of segovia) expect(dayOf(plan, p.id)).toBe(7); // Segóvia: 29/01
    for (const p of madrid) expect([3, 4, 5, 6]).toContain(dayOf(plan, p.id)); // Madrid: 25-28/01
    expect(plan.days.find((d) => d.day === 2)?.stops).toHaveLength(0); // Mérida: nada escolhido lá
  });
  it("dia sem hospedagem cadastrada não recebe lugares por adivinhação", () => {
    const plan = planItinerary(trip(), input({ days: [1, 2, 3, 4, 5, 6, 7, 8, 9] }));
    expect(plan.days.find((d) => d.day === 8)?.stops).toHaveLength(0);
    expect(plan.warnings.join()).toContain("sem hospedagem");
    const forced = planItinerary(trip(), input({ days: [7, 8], forcedDays: { "wd:Q557337": 8 } }));
    expect(forced.days.find((d) => d.day === 8)?.stops.map((s) => s.place.id)).toEqual(["wd:Q557337"]);
  });
  it("lugares vizinhos ficam no mesmo dia", () => {
    const plan = planItinerary(trip(), input());
    expect(dayOf(plan, "wd:Q171517")).toBe(dayOf(plan, "wd:Q849711"));
  });
  it("respeita compromisso com horário fixo e o almoço", () => {
    const plan = planItinerary(trip(), input());
    const d3 = plan.days.find((d) => d.day === 3)!;
    for (const s of d3.stops) expect(s.end <= 600 || s.start >= 660).toBe(true); // 10:00-11:00 livre
    const lunch = plan.days.flatMap((d) => d.busy).find((b) => b.meal === "lunch");
    expect(lunch && lunch.start >= 12 * 60 + 30 && lunch.start <= 15 * 60).toBe(true);
    for (const d of plan.days) {
      const blocks = [...d.stops.map((s) => [s.start, s.end]), ...d.busy.map((b) => [b.start, b.end])].sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < blocks.length; i++) expect(blocks[i][0]).toBeGreaterThanOrEqual(blocks[i - 1][1]);
    }
  });
  it("usa o horário cadastrado: espera abrir e avisa quando fecha no dia", () => {
    // 26/01/2027 é terça: Reina Sofía fecha às terças.
    const plan = planItinerary(trip(), input({ places: [madrid[5]], days: [4] }));
    expect(plan.days[0].conflicts).toEqual([{ kind: "closed", title: "Reina Sofía" }]);
    const prado = planItinerary(trip(), input({ places: [madrid[3]], days: [5], dayStart: "08:00" }));
    expect(toClock(prado.days[0].stops[0].start)).toBe("10:00");
  });
  it("aplicar mantém as atividades existentes e não duplica", () => {
    const t = trip();
    const plan = planItinerary(t, input());
    const saved = applyPlan(t, plan);
    expect(saved.activities.find((a) => a.id === "fixo")).toEqual(t.activities[0]);
    expect(saved.activities.length).toBe(t.activities.length + plan.summary.places);
    expect(applyPlan(saved, plan).activities.length).toBe(saved.activities.length);
    const again = planItinerary(saved, input());
    expect(again.summary.places).toBe(0);
    expect(again.unassigned.every((u) => u.reason === "Já está no roteiro")).toBe(true);
  });
  it("horários são locais de cada cidade, sem depender do fuso do aparelho", () => {
    const plan = planItinerary(trip(), input({ places: [belem], days: [1] }));
    expect(plan.days[0].date).toBe("2027-01-23");
    expect(toClock(plan.days[0].stops[0].start)).toMatch(/^09:/);
  });
});

describe("reorganização manual", () => {
  it("o dia escolhido pela pessoa vale mais que o agrupamento automático", () => {
    const plan = planItinerary(trip(), input({ forcedDays: { "wd:Q160112": 6 }, durations: { "wd:Q160112": 200 } }));
    const stop = plan.days.find((d) => d.day === 6)!.stops.find((s) => s.place.id === "wd:Q160112")!;
    expect(stop.visit).toBe(200);
    expect(stop.visitEstimated).toBe(false);
  });
});

describe("alternativas", () => {
  it("rápida usa menos dias; tranquila menos lugares por dia; econômica deixa pagos de fora primeiro", () => {
    const [fast, budget, relaxed] = planAlternatives(trip(), input({ places: madrid, days: [3, 4, 5, 6] }));
    expect(fast.summary.daysUsed).toBeLessThan(relaxed.summary.daysUsed);
    expect(Math.max(...relaxed.days.map((d) => d.stops.length))).toBeLessThanOrEqual(3);
    const tight = planAlternatives(trip(), input({ places: madrid, days: [3], pace: "relaxed" }))[1];
    expect(tight.days[0].stops.every((s) => s.place.tags.fee !== "yes")).toBe(true);
    expect(fast.warnings.join()).toContain("não são rotas reais");
  });
});
