import { describe, expect, it, beforeEach } from "vitest";
import { loadThemePref, resolveTheme, saveThemePref, themeKey } from "./theme";

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
});

describe("tema", () => {
  beforeEach(() => store.clear());
  it("começa no automático e segue o sistema", () => {
    expect(loadThemePref()).toBe("auto");
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
  });
  it("escolha manual vale mesmo com o sistema ao contrário", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("guarda a escolha neste aparelho", () => {
    saveThemePref("dark");
    expect(localStorage.getItem(themeKey)).toBe("dark");
    expect(loadThemePref()).toBe("dark");
    saveThemePref("auto");
    expect(localStorage.getItem(themeKey)).toBeNull();
    expect(loadThemePref()).toBe("auto");
  });
  it("ignora valores estranhos guardados", () => {
    localStorage.setItem(themeKey, "roxo");
    expect(loadThemePref()).toBe("auto");
  });
});
