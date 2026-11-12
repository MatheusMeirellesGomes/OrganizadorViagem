/*
 * Category equivalence between sources.
 *
 * A place can be classified in many ways: on Wikidata the Palacio Real de
 * Madrid is a "royal palace", a "museum" and a "tourist attraction"; on
 * OpenStreetMap a palace may be historic=palace, building=palace or
 * tourism=attraction. Before, anything that was not on a short list of
 * classes disappeared. Here every source is mapped to the same app categories
 * and, when a place has several, the most specific one wins (palace before
 * museum, park before memorial...).
 */

/** Wikidata classes (P31 targets or their superclasses) → app category. */
export const wikidataRoots: Record<string, string> = {
  Q16560: "palace", // palace
  Q53536964: "palace", // royal palace
  Q23413: "castle", // castle
  Q57821: "castle", // fortification
  Q1785071: "castle", // fort
  Q16970: "place_of_worship", // church building
  Q2977: "place_of_worship", // cathedral
  Q163687: "place_of_worship", // basilica
  Q44613: "place_of_worship", // monastery
  Q32815: "place_of_worship", // mosque
  Q34627: "place_of_worship", // synagogue
  Q44539: "place_of_worship", // temple
  Q1370598: "place_of_worship", // structure of worship
  Q839954: "archaeological_site",
  Q109607: "archaeological_site", // ruins
  Q43501: "zoo",
  Q2281788: "aquarium", // public aquarium
  Q2416723: "theme_park",
  Q194195: "theme_park", // amusement park
  Q33506: "museum",
  Q207694: "museum", // art museum
  Q1007870: "gallery", // art gallery
  Q174782: "square", // town square
  Q15243209: "historic_center", // historic district
  Q22698: "park",
  Q22746: "park", // urban park
  Q473972: "nature", // protected area
  Q46169: "nature", // national park
  Q1107656: "garden",
  Q167346: "garden", // botanical garden
  Q6017969: "viewpoint", // scenic viewpoint
  Q1440300: "viewpoint", // observation tower
  Q40080: "beach",
  Q34038: "nature", // waterfall
  Q35509: "nature", // cave
  Q23397: "nature", // lake
  Q8502: "mountain", // mountain
  Q207326: "mountain", // summit
  Q54050: "mountain", // hill
  Q2143825: "trail", // walking path / hiking trail
  Q628179: "trail", // trail
  Q37654: "marketplace", // market
  Q330284: "marketplace", // marketplace
  Q24354: "culture", // theatre
  Q153562: "culture", // opera house
  Q1060829: "culture", // concert hall
  Q483110: "stadium", // stadium
  Q641226: "stadium", // arena
  Q4989906: "monument",
  Q179700: "monument", // statue
  Q170980: "monument", // obelisk
  Q82117: "monument", // city gate
  Q143912: "monument", // triumphal arch
  Q483453: "monument", // fountain
  Q12518: "monument", // tower
  Q39715: "monument", // lighthouse
  Q12280: "monument", // bridge
  Q5003624: "memorial",
  Q575759: "memorial", // war memorial
  Q1081138: "historic", // historic site
  Q35112127: "historic", // historic building
  Q570116: "attraction", // tourist attraction
  Q2319498: "attraction", // landmark
};

/** Most specific first: when a place has several categories, the first wins. */
export const categoryPriority = [
  "castle",
  "palace",
  "place_of_worship",
  "archaeological_site",
  "zoo",
  "aquarium",
  "theme_park",
  "museum",
  "gallery",
  "square",
  "historic_center",
  "park",
  "garden",
  "viewpoint",
  "beach",
  "nature",
  "mountain",
  "trail",
  "marketplace",
  "culture",
  "stadium",
  "monument",
  "memorial",
  "historic",
  "attraction",
];

/**
 * Things that have coordinates and Wikipedia articles but are not places to
 * visit: towns, airports, stations, offices, schools, companies... They are
 * dropped unless they also are clearly a sight (a station that is also a
 * museum stays as museum).
 */
export const excludedRoots: Record<string, string> = {
  Q486972: "human settlement",
  Q56061: "administrative territorial entity",
  Q1248784: "airport",
  Q55488: "railway station",
  Q928830: "metro station",
  Q11691: "stock exchange",
  Q1021645: "office building",
  Q3914: "school",
  Q3918: "university",
  Q16917: "hospital",
  Q27686: "hotel",
  Q11315: "shopping center",
  Q4830453: "business",
  Q13226383: "facility",
  Q7075: "library",
  Q123705: "neighbourhood",
};
/** Weak categories: given only by broad classes, so an exclusion wins over them. */
const weakCategories = new Set(["historic", "attraction", "marketplace", "monument", "memorial"]);

export function bestCategory(found: Iterable<string>): string | undefined {
  const set = new Set(found);
  return categoryPriority.find((c) => set.has(c));
}

/**
 * Category from a Wikidata item's classes. `parents` maps classes that are not
 * roots to the roots they descend from (resolved with one SPARQL query).
 * Heritage-listed items (P1435) count as historic even with unusual classes.
 */
export function classifyWikidata(
  classes: string[],
  parents: Record<string, string[]>,
  heritage: boolean,
  flags: { demolished?: boolean; inCollection?: boolean } = {},
): string | undefined {
  // Demolished buildings (P576) and objects kept in a museum collection (P195)
  // are not places to visit.
  if (flags.demolished || flags.inCollection) return;
  const found: string[] = [];
  let excluded = false,
    neighbourhood = false;
  for (const c of classes) {
    for (const root of [c, ...(parents[c] ?? [])]) {
      if (wikidataRoots[root]) found.push(wikidataRoots[root]);
      if (excludedRoots[root]) excluded = true;
      if (root === "Q123705") neighbourhood = true;
    }
  }
  // Heritage-listed old quarters (Alfama, Baixa...) are visited as historic centers.
  if (neighbourhood && heritage) return "historic_center";
  const best = bestCategory(found) ?? (heritage ? "historic" : undefined);
  if (excluded && (!best || weakCategories.has(best))) return;
  return best;
}

/** Category from OpenStreetMap tags, using the same app categories. */
export function osmCategory(tags: Record<string, string>): string {
  const tag = (k: string) => tags[k] ?? "";
  const found: string[] = [];
  const historic = tag("historic"),
    building = tag("building"),
    tourism = tag("tourism"),
    leisure = tag("leisure"),
    natural = tag("natural"),
    amenity = tag("amenity");
  if (historic === "palace" || building === "palace" || tag("castle_type") === "palace" || tag("castle_type") === "stately")
    found.push("palace");
  if (["castle", "fort", "citywalls", "city_gate"].includes(historic) || building === "castle")
    found.push(historic === "city_gate" ? "monument" : "castle");
  if (amenity === "place_of_worship" || ["church", "cathedral", "chapel", "mosque", "synagogue", "temple", "monastery"].includes(building) || ["church", "cathedral", "chapel", "monastery", "wayside_shrine"].includes(historic))
    found.push("place_of_worship");
  if (["archaeological_site", "ruins"].includes(historic)) found.push("archaeological_site");
  if (tourism === "zoo") found.push("zoo");
  if (tourism === "aquarium") found.push("aquarium");
  if (tourism === "theme_park" || leisure === "water_park") found.push("theme_park");
  if (tourism === "museum") found.push("museum");
  if (tourism === "gallery") found.push("gallery");
  if (tag("place") === "square" || (tag("highway") === "pedestrian" && tag("area") === "yes" && tags.name?.match(/^(pra[cç]a|plaza|place|piazza|square|largo)/i)))
    found.push("square");
  if (leisure === "park") found.push("park");
  if (leisure === "garden") found.push("garden");
  if (tourism === "viewpoint") found.push("viewpoint");
  if (natural === "beach") found.push("beach");
  if (["waterfall", "cave_entrance", "spring"].includes(natural) || tag("waterway") === "waterfall" || leisure === "nature_reserve")
    found.push("nature");
  if (["peak", "volcano", "hill"].includes(natural)) found.push("mountain");
  if (amenity === "marketplace") found.push("marketplace");
  if (["theatre", "arts_centre", "concert_hall"].includes(amenity) || leisure === "stadium")
    found.push("culture");
  if (["monument", "statue", "obelisk", "memorial"].includes(historic) || tourism === "artwork" || amenity === "fountain")
    found.push(historic === "memorial" ? "memorial" : "monument");
  if (historic && !found.length) found.push("historic");
  if (tourism === "attraction") found.push("attraction");
  // Food and drink.
  if (amenity === "restaurant") found.push("restaurant");
  if (amenity === "cafe") found.push("cafe");
  if (amenity === "fast_food") found.push("fast_food");
  if (amenity === "food_court") found.push("food_court");
  if (amenity === "ice_cream" || tag("shop") === "ice_cream") found.push("ice_cream");
  if (tag("shop") === "bakery") found.push("bakery");
  if (tag("shop") === "pastry" || tag("shop") === "confectionery") found.push("pastry");
  return bestCategory(found) ?? found[found.length - 1] ?? "other";
}

/** Groups shown as filter chips. Each lists the categories it covers. */
export const attractionGroups: { id: string; label: string; categories: string[] }[] = [
  { id: "palaces", label: "Palácios", categories: ["palace"] },
  { id: "castles", label: "Castelos e fortalezas", categories: ["castle"] },
  { id: "squares", label: "Praças e centros históricos", categories: ["square", "historic_center"] },
  { id: "museums", label: "Museus e galerias", categories: ["museum", "gallery"] },
  { id: "monuments", label: "Monumentos", categories: ["monument", "memorial", "historic"] },
  { id: "worship", label: "Igrejas, catedrais e templos", categories: ["place_of_worship"] },
  { id: "parks", label: "Parques e jardins", categories: ["park", "garden"] },
  { id: "viewpoints", label: "Mirantes", categories: ["viewpoint"] },
  { id: "zoos", label: "Zoológicos e aquários", categories: ["zoo", "aquarium"] },
  { id: "markets", label: "Mercados", categories: ["marketplace"] },
  { id: "ruins", label: "Ruínas e sítios arqueológicos", categories: ["archaeological_site"] },
  { id: "nature", label: "Praias e natureza", categories: ["beach", "nature"] },
  { id: "mountains", label: "Montanhas e trilhas", categories: ["mountain", "trail"] },
  { id: "culture", label: "Cultura, espetáculos e estádios", categories: ["culture", "stadium"] },
  { id: "family", label: "Parques temáticos", categories: ["theme_park"] },
  { id: "other", label: "Outras atrações", categories: ["attraction", "other"] },
];

/** Categories where visits happen mostly outdoors or indoors (by category, not invented). */
export const outdoorCategories = new Set([
  "park", "garden", "viewpoint", "beach", "nature", "mountain", "trail", "square", "historic_center", "zoo", "theme_park", "archaeological_site",
]);
export const indoorCategories = new Set(["museum", "gallery", "aquarium", "culture", "place_of_worship", "palace"]);
/** Categories made for children and families (by what the place is). */
export const familyCategories = new Set(["zoo", "aquarium", "theme_park"]);
