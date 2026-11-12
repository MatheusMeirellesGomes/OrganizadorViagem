import { describe, it, expect } from "vitest";
import { classifyWikidata, osmCategory } from "./categories";
import { commonsFileName, verifiedPhoto, withUniquePhotos } from "./photos";
import { parseOpeningHours, isOpenAt, opensDuring } from "./hours";
import { matchesMeal, priceLevel, matchesCuisine, localMinuteOfWeek, openNow } from "./restaurants";
import type { Place } from "../places";

const place = (over: Partial<Place> & { tags?: Record<string, string> }): Place => ({
  id: "x",
  name: "Lugar",
  coordinates: { lat: 40.4168, lng: -3.7038 },
  category: "restaurant",
  address: "",
  city: "",
  country: "",
  source: "",
  retrievedAt: "2026-11-11T00:00:00Z",
  tags: {},
  ...over,
});

describe("equivalência de categorias", () => {
  // Classes reais (P31) observadas no Wikidata em 11/11/2026.
  it("o Palacio Real de Madrid é palácio, mesmo sendo também museu", () => {
    expect(classifyWikidata(["Q53536964", "Q15848826", "Q907116", "Q481289", "Q33506", "Q16560"], {}, true)).toBe("palace");
  });
  it("o Alcázar de Segovia é castelo antes de palácio", () => {
    expect(classifyWikidata(["Q23413", "Q16560", "Q33506"], {}, true)).toBe("castle");
  });
  it("o Retiro é parque, não memorial; classes desconhecidas usam as superclasses", () => {
    expect(
      classifyWikidata(["Q14946335", "Q1329623", "Q1200957", "Q22746"], { Q14946335: ["Q5003624"] }, true),
    ).toBe("park");
    expect(classifyWikidata(["Q56242215"], { Q56242215: ["Q2977", "Q16970"] }, true)).toBe("place_of_worship");
  });
  it("aeroportos, estações e cidades não viram atração, mesmo tombados", () => {
    expect(classifyWikidata(["Q1248784"], {}, true)).toBeUndefined();
    expect(classifyWikidata(["Q484170"], { Q484170: ["Q486972"] }, true)).toBeUndefined();
    expect(classifyWikidata(["Q11691"], { Q11691: ["Q37654"] }, false)).toBeUndefined();
    // Uma estação que também é museu continua como museu.
    expect(classifyWikidata(["Q55488", "Q33506"], {}, false)).toBe("museum");
  });
  it("bairros antigos tombados viram centro histórico; bairros comuns ficam fora", () => {
    expect(classifyWikidata(["Q2983893"], { Q2983893: ["Q123705", "Q486972"] }, true)).toBe("historic_center");
    expect(classifyWikidata(["Q2983893"], { Q2983893: ["Q123705", "Q486972"] }, false)).toBeUndefined();
  });
  it("lugares demolidos e obras de acervo de museu ficam fora", () => {
    expect(classifyWikidata(["Q23413"], {}, true, { demolished: true })).toBeUndefined();
    expect(classifyWikidata(["Q179700"], {}, false, { inCollection: true })).toBeUndefined();
  });
  it("tombamento sozinho vale como lugar histórico", () => {
    expect(classifyWikidata(["Q999999"], {}, true)).toBe("historic");
    expect(classifyWikidata(["Q999999"], {}, false)).toBeUndefined();
  });
  it("OpenStreetMap: palácio marcado como edifício histórico ou atração não desaparece", () => {
    expect(osmCategory({ historic: "building", building: "palace", tourism: "attraction" })).toBe("palace");
    expect(osmCategory({ historic: "castle", castle_type: "palace" })).toBe("castle");
    expect(osmCategory({ place: "square" })).toBe("square");
    expect(osmCategory({ amenity: "place_of_worship", building: "cathedral" })).toBe("place_of_worship");
    expect(osmCategory({ shop: "bakery" })).toBe("bakery");
    expect(osmCategory({ historic: "yes" })).toBe("historic");
  });
});

describe("fotos ligadas ao próprio lugar", () => {
  it("lê nomes de arquivo do Commons em vários formatos e recusa outros sites", () => {
    expect(commonsFileName("http://commons.wikimedia.org/wiki/Special:FilePath/Palacio%20Real%20de%20Madrid.jpg")).toBe("Palacio Real de Madrid.jpg");
    expect(commonsFileName("File:Plaza_Mayor.JPG")).toBe("Plaza Mayor.JPG");
    expect(commonsFileName("https://commons.wikimedia.org/wiki/File:Retiro.jpg")).toBe("Retiro.jpg");
    expect(commonsFileName("https://exemplo.com/foto.jpg")).toBeUndefined();
    expect(commonsFileName("File:Mapa.svg")).toBeUndefined();
  });
  it("usa a imagem P18 do item do Wikidata", () => {
    const p = place({ tags: { provider: "wikidata", image_source: "wikidata-p18", image_file: "Palacio Real.jpg" } });
    expect(verifiedPhoto(p)?.via).toBe("wikidata");
    expect(verifiedPhoto(p)?.url).toContain("commons.wikimedia.org/wiki/Special:FilePath/Palacio_Real.jpg");
  });
  it("nunca usa a etiqueta image livre do OpenStreetMap", () => {
    const p = place({ tags: { provider: "openstreetmap", image: "https://cdn.exemplo.com/vizinho.jpg" } });
    expect(verifiedPhoto(p)).toBeUndefined();
    const q = place({ tags: { provider: "openstreetmap", image: "x", wikimedia_commons: "File:Casa Labra.jpg" } });
    expect(verifiedPhoto(q)?.file).toBe("Casa Labra.jpg");
  });
  it("a mesma foto em dois lugares fica só no mais relevante (o primeiro)", () => {
    const a = place({ id: "a", tags: { provider: "wikidata", image_source: "wikidata-p18", image_file: "Praça.jpg" } });
    const b = place({ id: "b", tags: { provider: "wikidata", image_source: "wikidata-p18", image_file: "Praça.jpg" } });
    const [x, y] = withUniquePhotos([a, b]);
    expect(verifiedPhoto(x)).toBeDefined();
    expect(verifiedPhoto(y)).toBeUndefined();
    expect(y.tags.photo_shared).toBe("yes");
  });
});

describe("horários do OpenStreetMap", () => {
  it("lê dias, intervalos e madrugada", () => {
    const w = parseOpeningHours("Mo-Th 08:30-00:00; Fr 08:30-01:00; Sa 09:00-01:00; Su 09:00-00:00")!;
    expect(w).toBeDefined();
    // Sábado 00:30: ainda aberto pela regra de sexta (até 01:00).
    expect(isOpenAt(w, 5 * 1440 + 30)).toBe(true);
    // Sexta 00:30: a quinta fecha à meia-noite.
    expect(isOpenAt(w, 4 * 1440 + 30)).toBe(false);
    expect(isOpenAt(w, 4 * 1440 + 8 * 60)).toBe(false);
    expect(opensDuring(w, 20 * 60, 22 * 60)).toBe(true);
  });
  it("regras posteriores substituem as anteriores e off fecha o dia", () => {
    const w = parseOpeningHours("Mo-Su 12:00-16:00; Mo off")!;
    expect(isOpenAt(w, 13 * 60)).toBe(false);
    expect(isOpenAt(w, 1440 + 13 * 60)).toBe(true);
    expect(parseOpeningHours("24/7")).toEqual([[0, 7 * 1440]]);
  });
  it("não adivinha formatos que não entende", () => {
    expect(parseOpeningHours("Jan-Mar Mo-Fr 09:00-14:00")).toBeUndefined();
    expect(parseOpeningHours("sunrise-sunset")).toBeUndefined();
    expect(parseOpeningHours("PH off")).toBeUndefined();
  });
});

describe("restaurantes sem inventar dados", () => {
  const dinner = place({ tags: { opening_hours: "Mo-Su 13:00-16:00,20:00-23:30", country_code: "ES" } });
  const lunchOnly = place({ tags: { opening_hours: "Mo-Fr 12:00-16:00" } });
  it("jantar e almoço vêm do horário cadastrado; sem horário fica desconhecido", () => {
    expect(matchesMeal(dinner, "dinner")).toBe(true);
    expect(matchesMeal(lunchOnly, "dinner")).toBe(false);
    expect(matchesMeal(place({}), "dinner")).toBeUndefined();
    expect(matchesMeal(place({ tags: { breakfast: "yes" } }), "breakfast")).toBe(true);
  });
  it("tipos de lugar e culinária", () => {
    expect(matchesMeal(place({ category: "bakery" }), "bakery")).toBe(true);
    expect(matchesMeal(place({ category: "ice_cream" }), "dessert")).toBe(true);
    expect(matchesMeal(place({ tags: { cuisine: "spanish;tapas", country_code: "ES" } }), "traditional")).toBe(true);
    expect(matchesMeal(place({ tags: { cuisine: "burger", country_code: "ES" } }), "traditional")).toBe(false);
    expect(matchesCuisine(place({ tags: { cuisine: "sushi" } }), ["japanese"])).toBe(true);
    expect(matchesCuisine(place({ tags: { cuisine: "thai" } }), ["other"])).toBe(true);
    expect(matchesCuisine(place({ tags: { "diet:vegan": "only" } }), ["vegan"])).toBe(true);
  });
  it("faixa de preço só quando cadastrada", () => {
    expect(priceLevel(place({ tags: { price_range: "€€" } }))).toBe(2);
    expect(priceLevel(place({ tags: { "price:range": "$" } }))).toBe(1);
    expect(priceLevel(place({ tags: {} }))).toBeUndefined();
    expect(priceLevel(place({ tags: { price_range: "10-20" } }))).toBeUndefined();
  });
  it("aberto agora no fuso do lugar, não no do aparelho", () => {
    // 11/11/2026 19:30 UTC = quarta 20:30 em Madrid.
    const now = new Date("2026-11-11T19:30:00Z");
    expect(localMinuteOfWeek("ES", -3.7, now)).toBe(2 * 1440 + 20 * 60 + 30);
    expect(openNow(dinner, now)).toBe(true);
    // País sem fuso conhecido: não afirma nada.
    expect(openNow(place({ tags: { opening_hours: "24/7", country_code: "US" } }), now)).toBeUndefined();
  });
});
