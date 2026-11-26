import { describe, expect, it } from "vitest";
import { characterOptions, defaultCharacter, parseCharacter, randomCharacter } from "./character";
import { accountProfile, parseProfile } from "./profile";

describe("avatar desenhado", () => {
  it("aceita só valores conhecidos e completa o resto com o padrão", () => {
    const c = parseCharacter({ hair: "afro", skin: "#000000", hat: "<script>", glasses: "sun" })!;
    expect(c.hair).toBe("afro");
    expect(c.glasses).toBe("sun");
    expect(c.skin).toBe(defaultCharacter.skin);
    expect(c.hat).toBe(defaultCharacter.hat);
    expect(parseCharacter("x")).toBeUndefined();
  });
  it("o aleatório sempre gera um avatar válido", () => {
    for (let i = 0; i < 50; i++) {
      const c = randomCharacter();
      for (const [k, opts] of Object.entries(characterOptions)) expect(opts as readonly string[]).toContain(c[k as keyof typeof c]);
    }
  });
  it("vai para a conta junto com a escolha entre foto e avatar", () => {
    const p = parseProfile({ name: "Ana", character: { hair: "bun" }, look: "avatar" });
    expect(p.look).toBe("avatar");
    expect(accountProfile(p).character?.hair).toBe("bun");
    expect(parseProfile({ look: "qualquer" }).look).toBeUndefined();
  });
});
