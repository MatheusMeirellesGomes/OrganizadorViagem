import { getLocale } from "./i18n";
import { t as tr } from "./i18n";
import { ChoiceButtons } from "./ChoiceButtons";
import { choosePlace } from "./choices";
import { useState } from "react";
import { MapPin, Search, Compass } from "lucide-react";
import { TravelMap } from "./TravelMap";
import type { Trip } from "./model";
import { foodMatches, nearestPlaces, isFood, addPlaceToTrip } from "./food";
import { safeExternalUrl } from "./travel-mode";
import {
  categories,
  feeLabel,
  distanceKm,
  type CatalogKind,
  type Place,
  type Point,
} from "./places";
import {
  searchCatalog,
  locateDestination,
  type CatalogResult,
} from "./catalog-service";
import "./catalog.css";
export function PlaceDetails({ place: p }: { place: Place }) {
  return (
    <details>
      <summary>Conhecer o lugar</summary>
      <dl className="place-details">
        <dt>{tr("Endereço")}</dt>
        <dd>
          {[p.address, p.city, p.country].filter(Boolean).join(" · ") ||
            "Não informado"}
        </dd>
        <dt>{isFood(p) ? "Preço" : tr("Entrada")}</dt>
        <dd>
          {isFood(p) ? "Faixa de preço não informada" : feeLabel(p)}
          {p.tags.charge && (
            <p>Valor cadastrado (confirme na fonte): {p.tags.charge}</p>
          )}
        </dd>
        <dt>{tr("Horários")}</dt>
        <dd>
          {p.tags.opening_hours
            ? `${p.tags.opening_hours} · Cadastro colaborativo, confirme antes de ir.`
            : tr("Consultar site oficial")}
        </dd>
        {[
          ["Descrição", p.tags["description:pt"] || p.tags.description],
          ["Nome alternativo", p.tags.alt_name],
          ["Acessibilidade", p.tags.wheelchair],
          ["Banheiros", p.tags.toilets],
          ["Reserva", p.tags.reservation],
          ["Culinária", p.tags.cuisine],
          ["Telefone", p.tags.phone || p.tags["contact:phone"]],
          ["Vegetariano", p.tags["diet:vegetarian"]],
          ["Vegano", p.tags["diet:vegan"]],
        ]
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <div className="tm-actions">
        {safeExternalUrl(
          p.tags["website:menu"] || p.tags["contact:menu"] || "",
        ) && (
          <a
            href={safeExternalUrl(
              p.tags["website:menu"] || p.tags["contact:menu"],
            )}
            target="_blank"
            rel="noreferrer"
          >
            {tr("Cardápio cadastrado")}
          </a>
        )}
        {p.website && (
          <a href={p.website} target="_blank" rel="noreferrer">
            {tr("Site cadastrado")}
          </a>
        )}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${p.coordinates.lat},${p.coordinates.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          {tr("Como chegar")}
        </a>
        <a href={p.source} target="_blank" rel="noreferrer">
          {tr("Ver fonte")}
        </a>
      </div>
      <p className="subtle">
        Consultado em {new Date(p.retrievedAt).toLocaleString(getLocale())}
        {p.updatedAt
          ? " · Registro editado em " +
            new Date(p.updatedAt).toLocaleDateString(getLocale())
          : ""}
        . Dados podem mudar.
      </p>
    </details>
  );
}
export function Catalog({
  trips,
  onSave,
  saving,
}: {
  trips: Trip[];
  onSave: (t: Trip) => Promise<boolean>;
  saving: boolean;
}) {
  const [kind, setKind] = useState<CatalogKind>("attractions"),
    [cuisine, setCuisine] = useState(""),
    [diet, setDiet] = useState(""),
    [meal, setMeal] = useState(""),
    [sort, setSort] = useState("name"),
    [targetTrip, setTargetTrip] = useState(""),
    [targetDay, setTargetDay] = useState(1);
  const [point, setPoint] = useState<Point>(),
    [destination, setDestination] = useState(""),
    [located, setLocated] = useState(""),
    [radius, setRadius] = useState(3000),
    [result, setResult] = useState<CatalogResult>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [category, setCategory] = useState("all"),
    [query, setQuery] = useState(""),
    [fee, setFee] = useState("all"),
    [limit, setLimit] = useState(24);
  const filtered = (result?.places || []).filter(
    (p) =>
      (category === "all" || p.category === category) &&
      (!query ||
        p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
      (fee === "all" || p.tags.fee === fee) &&
      (kind !== "food" || foodMatches(p, { cuisine, diet, meal })),
  );
  const places =
    sort === "distance" ? nearestPlaces(filtered, point) : filtered;
  async function locate() {
    setBusy(true);
    setMessage("");
    try {
      const d = await locateDestination(destination);
      setPoint(d.point);
      setLocated(d.name + " · localização pela Wikipédia");
      setResult(undefined);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Não foi possível localizar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">DESCUBRA O SEU PRÓXIMO CAMINHO</p>
            <h2>Lugares de verdade, no seu ritmo</h2>
            <p>Busque uma cidade ou escolha uma região no mapa.</p>
          </div>
          <Compass size={30} />
        </div>
        <div className="tm-actions">
          {(["attractions", "food"] as CatalogKind[]).map((k) => (
            <button
              key={k}
              className={k === kind ? "primary" : "secondary"}
              aria-pressed={k === kind}
              disabled={busy}
              onClick={() => {
                setKind(k);
                setResult(undefined);
                setFee("all");
                setCategory("all");
              }}
            >
              {k === "food"
                ? tr("Restaurantes e cafés")
                : tr("Atrações e passeios")}
            </button>
          ))}
        </div>
        <form
          className="catalog-search"
          onSubmit={(e) => {
            e.preventDefault();
            void locate();
          }}
        >
          <label>
            {tr("Cidade ou destino")}
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Ex.: Madrid"
            />
          </label>
          <button className="secondary" disabled={busy}>
            <Search size={17} />
            {tr("Localizar")}
          </button>
        </form>
        <TravelMap
          trips={trips}
          selectable
          focus={point}
          focusZoom={13}
          onPick={(p) => {
            if (busy) return;
            setPoint(p);
            setLocated("Região escolhida no mapa");
            setResult(undefined);
          }}
        />
        {located && (
          <p>
            <MapPin size={16} /> {located}
          </p>
        )}
        <div className="catalog-search">
          <label>
            {tr("Raio da busca")}
            <select
              value={radius}
              disabled={busy}
              onChange={(e) => {
                setRadius(Number(e.target.value));
                setResult(undefined);
              }}
            >
              {[500, 1000, 3000, 5000, 10000].map((n) => (
                <option key={n} value={n}>
                  {n / 1000} km
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={busy || !point}
            onClick={async () => {
              if (!point) return;
              setBusy(true);
              setMessage("");
              try {
                const r = await searchCatalog(point, radius, kind);
                setResult(r);
                setLimit(24);
                setCategory("all");
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "Consulta indisponível.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Consultando…"
              : kind === "food"
                ? "Buscar restaurantes nesta região"
                : "Buscar atrações nesta região"}
          </button>
        </div>
        <p className="subtle">
          A consulta envia apenas a região selecionada à fonte. Cobertura
          colaborativa: nenhum catálogo reúne todos os lugares. Amplie ou mude a
          região para explorar mais.
        </p>
        <p role="status">{message}</p>
        <a
          href={
            "https://www.google.com/maps/search/?api=1&query=" +
            encodeURIComponent(
              (kind === "food" ? "restaurantes " : "atrações turísticas ") +
                destination,
            )
          }
          target="_blank"
          rel="noreferrer"
        >
          Pesquisar também no Google Maps
        </a>
      </section>
      {result && (
        <section className="catalog-results">
          <div className="section-head">
            <div>
              <h2>{places.length} lugares encontrados</h2>
              <p>
                {result.cached ? "Consulta salva" : "Consulta recebida"} em{" "}
                {new Date(result.retrievedAt).toLocaleString(getLocale())}
              </p>
            </div>
          </div>
          <div className="catalog-filters">
            <label>
              {tr("Filtrar por nome")}
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(24);
                }}
              />
            </label>
            <label>
              {tr("Categoria")}
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setLimit(24);
                }}
              >
                <option value="all">{tr("Todas as categorias")}</option>
                {Object.entries(categories)
                  .filter(([key]) =>
                    result.places.some((p) => p.category === key),
                  )
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {tr("Entrada")}
              <select
                value={fee}
                onChange={(e) => {
                  setFee(e.target.value);
                  setLimit(24);
                }}
              >
                <option value="all">Todas · inclusive sem preço</option>
                <option value="no">Gratuitas cadastradas</option>
                <option value="yes">Pagas cadastradas</option>
              </select>
            </label>
          </div>
          {kind === "food" && (
            <>
              <div className="catalog-filters">
                <label>
                  {tr("Culinária")}
                  <input
                    placeholder="Ex.: italian, brazilian"
                    value={cuisine}
                    onChange={(e) => {
                      setCuisine(e.target.value);
                      setLimit(24);
                    }}
                  />
                </label>
                <label>
                  {tr("Preferência alimentar")}
                  <select
                    value={diet}
                    onChange={(e) => {
                      setDiet(e.target.value);
                      setLimit(24);
                    }}
                  >
                    <option value="">Todas · inclusive sem informação</option>
                    <option value="vegetarian">
                      {tr("Vegetariana informada")}
                    </option>
                    <option value="vegan">{tr("Vegana informada")}</option>
                  </select>
                </label>
                <label>
                  {tr("Refeição cadastrada")}
                  <select
                    value={meal}
                    onChange={(e) => {
                      setMeal(e.target.value);
                      setLimit(24);
                    }}
                  >
                    <option value="">{tr("Todas")}</option>
                    <option value="breakfast">{tr("Café da manhã")}</option>
                    <option value="lunch">{tr("Almoço")}</option>
                    <option value="dinner">{tr("Jantar")}</option>
                  </select>
                </label>
              </div>
              <p className="subtle">
                Filtros usam apenas informações cadastradas. Faixa de custo e
                avaliações não estão disponíveis nesta fonte.
              </p>
            </>
          )}
          <div className="catalog-filters">
            <label>
              {tr("Ordenar")}
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="name">{tr("Nome")}</option>
                <option value="distance">
                  {tr("Proximidade do ponto escolhido")}
                </option>
              </select>
            </label>
            <label>
              {tr("Adicionar à viagem")}
              <select
                value={targetTrip}
                onChange={(e) => setTargetTrip(e.target.value)}
              >
                <option value="">{tr("Escolha uma viagem")}</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Dia do roteiro")}
              <input
                type="number"
                min="1"
                max="3660"
                value={targetDay}
                onChange={(e) => setTargetDay(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="catalog-grid">
            {places.slice(0, limit).map((p) => (
              <article className="panel place-card" key={p.id}>
                <span className="eyebrow">{tr(categories[p.category])}</span>
                <h3>{p.name}</h3>
                <p>
                  {isFood(p) ? "Faixa de preço não informada" : feeLabel(p)}
                </p>
                {point && (
                  <p>
                    {distanceKm(point, p.coordinates).toFixed(1)} km em linha
                    reta do ponto escolhido
                  </p>
                )}
                <PlaceDetails place={p} />
                <ChoiceButtons
                  value={
                    trips
                      .find((t) => t.id === targetTrip)
                      ?.placeChoices?.find((c) => c.place.id === p.id)?.decision
                  }
                  disabled={!targetTrip || busy || saving}
                  onChoose={async (decision) => {
                    const t = trips.find((t) => t.id === targetTrip);
                    if (t && (await onSave(choosePlace(t, p, decision))))
                      setMessage(
                        "Decisão salva. Veja seus lugares dentro da viagem.",
                      );
                  }}
                />
                <button
                  className="secondary"
                  disabled={!targetTrip || busy || saving}
                  onClick={async () => {
                    const t = trips.find((t) => t.id === targetTrip);
                    if (!t) return;
                    try {
                      if (await onSave(addPlaceToTrip(t, p, targetDay)))
                        setMessage(
                          p.name + " adicionado ao dia " + targetDay + ".",
                        );
                    } catch (e) {
                      setMessage(
                        e instanceof Error
                          ? e.message
                          : "Não foi possível adicionar.",
                      );
                    }
                  }}
                >
                  {tr("Adicionar ao roteiro")}
                </button>
              </article>
            ))}
          </div>
          {!places.length && (
            <p className="panel">
              Nenhum lugar corresponde a esta busca. Ajuste os filtros ou
              consulte outra região.
            </p>
          )}
          {places.length > limit && (
            <button
              className="secondary"
              onClick={() => setLimit((n) => n + 24)}
            >
              Mostrar mais lugares ({places.length - limit} restantes)
            </button>
          )}
          <p className="subtle">
            ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap contributors · ODbL
            </a>
            . Sem preços, avaliações ou horários gerados por IA.
          </p>
        </section>
      )}
    </>
  );
}
