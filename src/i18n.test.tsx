import { afterEach, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { setLanguage, translate, formatNumber } from "./i18n";
import { TravelMode } from "./TravelMode";
import { newTrip } from "./model";
afterEach(() => setLanguage("pt-BR"));
it("traduz chaves conhecidas, mantém fallback e interpola texto sem HTML", () => {
  expect(translate("Nova viagem", "en")).toBe("New trip");
  expect(translate("Nova viagem", "es")).toBe("Nuevo viaje");
  expect(translate("Minha anotação pessoal", "en")).toBe(
    "Minha anotação pessoal",
  );
  expect(translate("{count} itens", "pt-BR", { count: 2 })).toBe("2 itens");
});
it("adapta números pelo idioma selecionado", () => {
  setLanguage("en");
  expect(formatNumber(1234.5, 1)).toBe("1,234.5");
  setLanguage("pt-BR");
  expect(formatNumber(1234.5, 1)).toBe("1.234,5");
});
it("muda interface sem traduzir nomes nem anotações pessoais", () => {
  setLanguage("en");
  const html = renderToStaticMarkup(
    <TravelMode
      trip={newTrip({ title: "Nova viagem", notes: "Minha viagem em família" })}
      day={1}
      onDayChange={() => {}}
      onBack={() => {}}
      onSave={async () => true}
      online
      busy={false}
    />,
  );
  expect(html).toContain("Travel Mode");
  expect(html).toContain("Nova viagem");
  expect(html).toContain("Minha viagem em família");
  expect(html).toContain("Back to planning");
});
