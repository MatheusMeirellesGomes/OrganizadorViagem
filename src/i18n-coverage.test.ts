import { describe, expect, it } from "vitest";
import core from "./locales/core.json";
import { categories } from "./places";
import { attractionGroups } from "./explore/categories";
import { mealLabels, cuisineOptions } from "./explore/restaurants";

// Every text passed to tr()/tf()/t()/tLabel() must exist in English and Spanish,
// with the same {placeholders}. New untranslated UI text fails here.
const dictionary = core as Record<string, string[]>;
const ignore = new Set([
  "America/Sao_Paulo",
  "America/Manaus",
  "Europe/Lisbon",
  "Europe/Madrid",
  "America/New_York",
  "Asia/Tokyo",
]);
// Source files as text, read by Vite at test time (no Node types needed).
const files = (
  import.meta as unknown as {
    glob: (
      pattern: string[],
      options: { query: string; import: string; eager: true },
    ) => Record<string, string>;
  }
).glob(["./*.ts", "./*.tsx", "./explore/*.ts", "./explore/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const sources = Object.entries(files);
const keys = new Map<string, string>();
for (const [file, text] of sources)
  for (const m of text.matchAll(/\b(?:tr|tf|t|tLabel)\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    const key = JSON.parse('"' + m[1] + '"') as string;
    if (!ignore.has(key)) keys.set(key, file);
  }
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("traduções", () => {
  it("encontra os textos da interface", () => {
    expect(keys.size).toBeGreaterThan(500);
  });
  it("todo texto da interface tem inglês e espanhol", () => {
    const missing = [...keys].filter(([k]) => !dictionary[k]).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });
  it("traduções mantêm as mesmas variáveis", () => {
    const wrong = Object.entries(dictionary)
      .filter(([k, v]) => v.some((x) => placeholders(x).join() !== placeholders(k).join()))
      .map(([k]) => k);
    expect(wrong).toEqual([]);
  });
  it("textos traduzidos não são usados como valores de controle", () => {
    // e.g. tabs: tr("Roteiro") stored as state but compared with "Roteiro"
    // made every tab empty in English and Spanish.
    const problems: string[] = [];
    for (const [file, text] of sources) {
      const translated = new Set(
        [...text.matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)].map((m) => m[1]),
      );
      for (const key of translated) {
        const quoted = JSON.stringify(key);
        const asValue = [
          "=== " + quoted,
          "!== " + quoted,
          "case " + quoted,
          "useState(" + quoted,
        ].some((p) => text.includes(p));
        const inSetter = new RegExp("set\\w+\\(" + quoted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\)").test(text);
        if ((asValue || inSetter) && text.includes("tr(" + quoted + ")"))
          problems.push(`${file}: ${key}`);
      }
    }
    expect(problems).toEqual([]);
  });
  it("rótulos guardados em listas também têm tradução", () => {
    const labels = [
      ...Object.values(categories),
      ...attractionGroups.map((g) => g.label),
      ...Object.values(mealLabels),
      ...cuisineOptions.map((c) => c.label),
    ];
    expect(labels.filter((l) => !dictionary[l])).toEqual([]);
  });
  it("nenhuma tradução está vazia", () => {
    const empty = Object.entries(dictionary)
      .filter(([, v]) => v.length !== 2 || v.some((x) => !x.trim()))
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });
});
