import { describe, expect, it } from "vitest";
import { newTrip } from "../model";
import { accountProfile, loadProfile, parseProfile, personalStats, saveProfile, validAvatarData } from "./profile";
import { checkAvatarFile, clampCrop, sourceRect, sniffImage } from "./avatar";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const webp = "data:image/webp;base64," + btoa("RIFF\x10\x00\x00\x00WEBPVP8 abcdef");

describe("perfil", () => {
  it("lê o formato antigo sem perder o nome e o ritmo", () => {
    expect(parseProfile({ name: "Matheus Teste", style: "Prefiro dias tranquilos" })).toMatchObject({ name: "Matheus Teste", pace: "calm" });
    expect(parseProfile(null)).toMatchObject({ name: "", pace: "own" });
  });
  it("guarda e recupera as preferências, descartando valores desconhecidos", () => {
    const s = memory();
    expect(saveProfile(s, { name: " Ana ", pace: "intense", currency: "eur", styles: ["culture", "hack"], food: ["vegan"], transport: ["train"], accessibility: ["few_stairs"] })).toBe(true);
    expect(loadProfile(s)).toEqual({ name: "Ana", bio: undefined, homeCity: undefined, pace: "intense", currency: "EUR", styles: ["culture"], food: ["vegan"], transport: ["train"], accessibility: ["few_stairs"], avatar: undefined });
  });
  it("aceita só fotos válidas e nunca manda os bytes da foto local para a conta", () => {
    expect(validAvatarData(webp)).toBe(true);
    expect(validAvatarData("data:image/svg+xml;base64," + btoa("<svg/>"))).toBe(false);
    expect(validAvatarData("data:image/jpeg;base64," + btoa("MZ executable"))).toBe(false);
    const local = parseProfile({ name: "Ana", avatar: { kind: "local", data: webp } });
    expect(local.avatar?.kind).toBe("local");
    expect(accountProfile(local).avatar).toBeUndefined();
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseProfile({ avatar: { kind: "cloud", path: id + "/perfil/avatar-x.webp" } }).avatar?.kind).toBe("cloud");
    expect(parseProfile({ avatar: { kind: "cloud", path: "../outro/arquivo" } }).avatar).toBeUndefined();
  });
  it("remover a foto apaga o avatar salvo", () => {
    const s = memory();
    saveProfile(s, parseProfile({ name: "Ana", avatar: { kind: "local", data: webp } }));
    saveProfile(s, { ...loadProfile(s), avatar: undefined });
    expect(loadProfile(s).avatar).toBeUndefined();
    expect(s.m.get("atlas-profile")).not.toContain("WEBP");
  });
  it("estatísticas vêm só dos dados cadastrados", () => {
    const a = newTrip({ status: "past", scope: "national", destination: "Ouro Preto" });
    a.activities = [{ id: "1", title: "Igreja", day: 1, time: "", address: "", done: true, kind: "", placeId: "p" }];
    a.placeChoices = [{ decision: "want", decidedAt: "", place: { id: "p", name: "Igreja", address: "", city: "", country: "BR", category: "church", source: "", retrievedAt: "", tags: {} } }];
    const b = newTrip({ status: "past", destination: "Madrid" });
    b.stays = [{ id: "s", name: "H", address: "", city: "Segóvia", start: "", end: "", checkInTime: "", checkOutTime: "", url: "", confirmation: "", notes: "" }];
    const c = newTrip({ status: "upcoming", title: "Lisboa", start: "2027-01-23" });
    const s = personalStats([a, b, c], "2027-01-13");
    expect(s).toMatchObject({ done: 2, countries: 1, cities: 3, places: 1 });
    expect(s.next?.trip.title).toBe("Lisboa");
    expect(s.next?.days).toBe(10);
    expect(personalStats([], "2027-01-13").next).toBeUndefined();
  });
});

describe("foto de perfil", () => {
  it("reconhece o tipo pelo conteúdo", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(Uint8Array.from("\x89PNG\r\n\x1a\n....", (c) => c.charCodeAt(0)))).toBe("image/png");
    expect(sniffImage(new TextEncoder().encode("MZ\x90\x00"))).toBeUndefined();
  });
  it("recusa outros tipos, arquivos grandes e conteúdo falso", async () => {
    await expect(checkAvatarFile(new Blob(["MZ"], { type: "application/x-msdownload" }))).rejects.toThrow("JPG, PNG ou WebP");
    await expect(checkAvatarFile(new Blob(["MZ\x90\x00 not an image"], { type: "image/png" }))).rejects.toThrow("não corresponde");
    await expect(checkAvatarFile(new Blob([new Uint8Array(11 * 1024 * 1024)], { type: "image/jpeg" }))).rejects.toThrow("10 MB");
    await expect(checkAvatarFile(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], { type: "image/jpeg" }))).resolves.toBeUndefined();
  });
  it("o enquadramento sempre cobre o quadrado", () => {
    // 1000x500 in a 200px square: scale 0.4, image 400x200, can move 100px sideways only.
    expect(clampCrop(1000, 500, 200, { zoom: 1, x: 999, y: 50 })).toEqual({ zoom: 1, x: 100, y: 0 });
    expect(sourceRect(1000, 500, 200, { zoom: 1, x: 0, y: 0 })).toEqual({ sx: 250, sy: 0, size: 500 });
    expect(sourceRect(1000, 500, 200, { zoom: 2, x: 0, y: 0 })).toEqual({ sx: 375, sy: 125, size: 250 });
    expect(clampCrop(10, 10, 200, { zoom: 9, x: 0, y: 0 }).zoom).toBe(4);
  });
});
