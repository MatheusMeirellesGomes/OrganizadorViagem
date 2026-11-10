import { describe, it, expect } from "vitest";
import { newTrip, type Stay } from "./model";
import { staysOnDate, removeStay, stayFromForm, stayDirections } from "./stays";
import { parseBackup, offlineDocument } from "./offline";
const stay: Stay = {
  id: "hotel",
  name: "Hotel",
  address: "Rua",
  city: "Cidade",
  start: "2027-01-22",
  end: "2027-01-24",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  url: "https://example.com",
  confirmation: "ABC",
  notes: "",
};
describe("hospedagens e reservas", () => {
  it("seleciona noites sem presumir hospedagem quando faltam datas", () => {
    const t = newTrip({ stays: [stay] });
    expect(staysOnDate(t, "2027-01-22")).toEqual([stay]);
    expect(staysOnDate(t, "2027-01-24")).toEqual([]);
    expect(staysOnDate(t, "")).toEqual([]);
    expect(
      staysOnDate(newTrip({ stays: [{ ...stay, start: "" }] }), "2027-01-23"),
    ).toEqual([]);
  });
  it("desvincula hotel excluído sem apagar reservas nem alterar original", () => {
    const t = newTrip({
      stays: [stay],
      reservations: [
        {
          id: "r",
          title: "Reserva",
          url: stay.url,
          details: "",
          stayId: "hotel",
        },
      ],
    });
    const next = removeStay(t, "hotel");
    expect(next.stays).toEqual([]);
    expect(next.reservations[0].stayId).toBeUndefined();
    expect(next.reservations[0].url).toBe(stay.url);
    expect(t.stays).toHaveLength(1);
  });
  it("importa relações com novos IDs e mantém hospedagem antiga", () => {
    const t = newTrip({
      hotel: "Anterior",
      stays: [stay],
      activities: [
        {
          id: "a",
          title: "Passeio",
          day: 1,
          time: "",
          address: "",
          kind: "",
          done: false,
        },
      ],
      reservations: [
        {
          id: "r",
          title: "Reserva",
          url: stay.url,
          details: "",
          stayId: "hotel",
          activityId: "a",
        },
      ],
    });
    const [copy] = parseBackup(JSON.stringify({ version: 1, trips: [t] }));
    expect(copy.hotel).toBe("Anterior");
    expect(copy.stays![0].id).not.toBe("hotel");
    expect(copy.reservations[0].stayId).toBe(copy.stays![0].id);
    expect(copy.reservations[0].activityId).toBe(copy.activities[0].id);
    expect(offlineDocument(copy)).toContain("ABC");
  });
  it("aceita detalhes vazios e rejeita dados perigosos ou incompletos", () => {
    const f = new FormData();
    expect(stayFromForm(f, "s").name).toBe("Hospedagem");
    f.set("url", "javascript:alert(1)");
    expect(() => stayFromForm(f, "s")).toThrow();
    f.delete("url");
    f.set("lat", "0");
    expect(() => stayFromForm(f, "s")).toThrow();
    f.set("lng", "0");
    expect(stayFromForm(f, "s").coordinates).toEqual({ lat: 0, lng: 0 });
    f.set("start", "2027-02-30");
    expect(() => stayFromForm(f, "s")).toThrow();
    expect(
      stayDirections({ ...stay, coordinates: { lat: 0, lng: 0 } }),
    ).toContain("0%2C0");
  });
});
