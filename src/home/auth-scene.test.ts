import { describe, expect, it } from "vitest";
import { authSlides, slideOrder } from "./AuthScene";

describe("fotos da tela de entrada", () => {
  it("tem entre 15 e 20 fotos sem repetir e mantém as três originais", () => {
    expect(authSlides.length).toBeGreaterThanOrEqual(15);
    expect(authSlides.length).toBeLessThanOrEqual(20);
    expect(new Set(authSlides.map((s) => s.id)).size).toBe(authSlides.length);
    expect(authSlides.slice(0, 3).map((s) => s.place)).toEqual(["Capadócia, Turquia", "Acima das nuvens", "Pôr do sol no mar"]);
  });
  it("embaralha usando todas as fotos uma vez", () => {
    const o = slideOrder(19, null, () => 0.3);
    expect([...o].sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, i) => i));
  });
  it("não começa pela mesma foto do último acesso", () => {
    for (let k = 0; k < 30; k++) {
      const first = slideOrder(19, null)[0];
      expect(slideOrder(19, first)[0]).not.toBe(first);
    }
  });
});
