import { decor, hideOnError } from "./decor";
import { getLocale } from "./i18n";
import { t as tr, tf, formatNumber } from "./i18n";
import { ChoiceButtons } from "./ChoiceButtons";
import { choosePlace } from "./choices";
import { useState } from "react";
import { MapPin, Search } from "lucide-react";
import { TravelMap } from "./LazyMaps";
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
  complementAttractions,
  type CatalogResult,
} from "./catalog-service";
import "./catalog.css";
const isWiki = (p: Place) => p.tags.provider === "wikipedia";
export function PhotoCredit({ place: p }: { place: Place }) {
  const file = p.tags.image_file;
  if (!file) return null;
  const page =
    "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(file);
  const license = safeExternalUrl(p.tags.image_license_url || "");
  return (
    <p className="photo-credit">
      {tr("Foto")}:{" "}
      <a href={page} target="_blank" rel="noreferrer">
        {p.tags.image_artist || tr("Wikimedia Commons")}
      </a>
      {p.tags.image_license && (
        <>
          {" · "}
          {license ? (
            <a href={license} target="_blank" rel="noreferrer">
              {p.tags.image_license}
            </a>
          ) : (
            p.tags.image_license
          )}
        </>
      )}
    </p>
  );
}
function WikiDetails({ place: p }: { place: Place }) {
  return (
    <details>
      <summary>{tr("Conhecer o lugar")}</summary>
      <dl className="place-details">
        <dt>{tr("Ingressos e horários")}</dt>
        <dd>
          {p.website
            ? tr("Confira no site oficial antes de ir.")
            : tr("Não informados pela fonte. Confira antes de ir.")}
        </dd>
        {p.tags.heritage && (
          <>
            <dt>{tr("Proteção")}</dt>
            <dd>{tr("Bem tombado ou classificado como patrimônio")}</dd>
          </>
        )}
      </dl>
      <div className="tm-actions">
        {p.website && (
          <a href={p.website} target="_blank" rel="noreferrer">
            {tr("Site oficial")}
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
          {tr("Ler na Wikipédia")}
        </a>
      </div>
      <p className="subtle">
        {tf("Consultado em {date}. Dados podem mudar.", {
          date: new Date(p.retrievedAt).toLocaleString(getLocale()),
        })}
      </p>
    </details>
  );
}
export function PlaceDetails({ place: p }: { place: Place }) {
  if (isWiki(p)) return <WikiDetails place={p} />;
  return (
    <details>
      <summary>{tr("Conhecer o lugar")}</summary>
      <dl className="place-details">
        <dt>{tr("Endereço")}</dt>
        <dd>
          {[p.address, p.city, p.country].filter(Boolean).join(" · ") ||
            tr("Não informado")}
        </dd>
        <dt>{isFood(p) ? tr("Preço") : tr("Entrada")}</dt>
        <dd>
          {isFood(p) ? tr("Faixa de preço não informada") : tr(feeLabel(p))}
          {p.tags.charge && (
            <p>{tr("Valor cadastrado (confirme na fonte):")}{" "}{p.tags.charge}</p>
          )}
        </dd>
        <dt>{tr("Horários")}</dt>
        <dd>
          {p.tags.opening_hours
            ? `${p.tags.opening_hours} · Cadastro colaborativo, confirme antes de ir.`
            : tr("Consultar site oficial")}
        </dd>
        {[
          [tr("Descrição"), p.tags["description:pt"] || p.tags.description],
          [tr("Nome alternativo"), p.tags.alt_name],
          [tr("Acessibilidade"), p.tags.wheelchair],
          [tr("Banheiros"), p.tags.toilets],
          [tr("Reserva"), p.tags.reservation],
          [tr("Culinária"), p.tags.cuisine],
          [tr("Telefone"), p.tags.phone || p.tags["contact:phone"]],
          [tr("Vegetariano"), p.tags["diet:vegetarian"]],
          [tr("Vegano"), p.tags["diet:vegan"]],
        ]
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{tr(label)}</dt>
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
      <p className="subtle">{tr("Consultado em")}{" "}{new Date(p.retrievedAt).toLocaleString(getLocale())}
        {p.updatedAt
          ? tr(" · Registro editado em ") +
            new Date(p.updatedAt).toLocaleDateString(getLocale())
          : ""}{tr(". Dados podem mudar.")}</p>
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
    [limit, setLimit] = useState(24),
    [onlyTourist, setOnlyTourist] = useState(true);
  const unclassified = (result?.places || []).filter(
    (p) => p.tags.unclassified === "yes",
  ).length;
  const filtered = (result?.places || []).filter(
    (p) =>
      (!onlyTourist || p.tags.unclassified !== "yes") &&
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
      setLocated(tf("{name} · localização pela Wikipédia", { name: d.name }));
      setResult(undefined);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : tr("Não foi possível localizar."),
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
            <p className="eyebrow">{tr("DESCUBRA O SEU PRÓXIMO CAMINHO")}</p>
            <h2>{tr("Lugares de verdade, no seu ritmo")}</h2>
            <p>{tr("Busque uma cidade ou escolha uma região no mapa.")}</p>
          </div>
          <img
            className="head-photo"
            src={decor.roadWide}
            alt=""
            loading="lazy"
            onError={hideOnError}
          />
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
              placeholder={tr("Ex.: Madrid")}
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
                const r = await searchCatalog(point, radius, kind, {
                  onProgress: (done, total) =>
                    setMessage(
                      tf("Consultando o OpenStreetMap… {done} de {total}", {
                        done,
                        total,
                      }),
                    ),
                });
                setMessage("");
                setResult(r);
                setLimit(24);
                setCategory("all");
                setSort(kind === "food" ? "name" : "distance");
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : tr("Consulta indisponível."),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? tr("Consultando…")
              : kind === "food"
                ? tr("Buscar restaurantes nesta região")
                : tr("Buscar atrações nesta região")}
          </button>
        </div>
        <p className="subtle">
          {kind === "food"
            ? tr(
                "Restaurantes vêm do OpenStreetMap (busca Nominatim): até 40 por tipo, com culinária, horário e site quando cadastrados.",
              )
            : tr(
                "Atrações vêm da Wikipédia e do Wikidata: até 100 lugares com artigo, do mais próximo ao mais distante.",
              )}{" "}
          {tr(
            "A consulta envia apenas a região escolhida. Nenhum catálogo reúne todos os lugares.",
          )}
        </p>
        <p role="status">{tr(message)}</p>
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
        >{tr("Pesquisar também no Google Maps")}</a>
      </section>
      {result && (
        <section className="catalog-results">
          <div className="section-head">
            <div>
              <h2>{tf("{count} lugares encontrados", { count: places.length })}</h2>
              <p>
                {result.cached ? tr("Consulta salva") : tr("Consulta recebida")} em{" "}
                {new Date(result.retrievedAt).toLocaleString(getLocale())}
              </p>
            </div>
          </div>
          {result.provider === "wikipedia" && !result.complemented && (
            <div className="catalog-complement panel">
              <p>
                {result.places.filter((p) => p.tags.unclassified !== "yes")
                  .length < 10
                  ? tr(
                      "Poucos artigos da Wikipédia nesta região. Complete com museus, parques, mirantes e cachoeiras do OpenStreetMap.",
                    )
                  : tr(
                      "Quer mais opções? Complete com museus, parques, mirantes e cachoeiras do OpenStreetMap.",
                    )}
              </p>
              <button
                className="secondary"
                disabled={busy || !point}
                onClick={async () => {
                  if (!point) return;
                  setBusy(true);
                  try {
                    const r = await complementAttractions(point, radius, result, {
                      onProgress: (done, total) =>
                        setMessage(
                          tf("Consultando o OpenStreetMap… {done} de {total}", {
                            done,
                            total,
                          }),
                        ),
                    });
                    const added = r.places.length - result.places.length;
                    setResult(r);
                    setMessage(
                      tf("{count} lugares do OpenStreetMap adicionados.", {
                        count: added,
                      }),
                    );
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : tr("Consulta indisponível."),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? tr("Consultando…") : tr("Completar com OpenStreetMap")}
              </button>
            </div>
          )}
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
                      {tr(label)}
                    </option>
                  ))}
              </select>
            </label>
            {result.places.some((p) => p.tags.fee) && (
            <label>
              {tr("Entrada")}
              <select
                value={fee}
                onChange={(e) => {
                  setFee(e.target.value);
                  setLimit(24);
                }}
              >
                <option value="all">{tr("Todas · inclusive sem preço")}</option>
                <option value="no">{tr("Gratuitas cadastradas")}</option>
                <option value="yes">{tr("Pagas cadastradas")}</option>
              </select>
            </label>
            )}
            {unclassified > 0 && (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={onlyTourist}
                  onChange={(e) => {
                    setOnlyTourist(e.target.checked);
                    setLimit(24);
                  }}
                />
                {tf("Só pontos turísticos ({count} outros lugares ocultos)", {
                  count: unclassified,
                })}
              </label>
            )}
          </div>
          {kind === "food" && (
            <>
              <div className="catalog-filters">
                <label>
                  {tr("Culinária")}
                  <input
                    placeholder={tr("Ex.: italian, brazilian")}
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
                    <option value="">{tr("Todas · inclusive sem informação")}</option>
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
              <p className="subtle">{tr("Filtros usam apenas informações cadastradas. Faixa de custo e avaliações não estão disponíveis nesta fonte.")}</p>
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
                {p.tags.image && (
                  <figure className="place-photo">
                    <img
                      src={p.tags.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    <figcaption>
                      <PhotoCredit place={p} />
                    </figcaption>
                  </figure>
                )}
                <span className="eyebrow">
                  {tr(categories[p.category])}
                  {p.tags.heritage && " · " + tr("Patrimônio")}
                </span>
                <h3>{p.name}</h3>
                {isWiki(p) ? (
                  p.tags.description && (
                    <p className="place-description">{p.tags.description}</p>
                  )
                ) : (
                  <p>
                    {isFood(p) ? tr("Faixa de preço não informada") : tr(feeLabel(p))}
                  </p>
                )}
                {point && (
                  <p>
                    {tf("{km} km em linha reta do ponto escolhido", {
                      km: formatNumber(distanceKm(point, p.coordinates), 1),
                    })}
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
                        tr("Decisão salva. Veja seus lugares dentro da viagem."),
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
                          tf("{name} adicionado ao dia {day}.", { name: p.name, day: targetDay }),
                        );
                    } catch (e) {
                      setMessage(
                        e instanceof Error
                          ? e.message
                          : tr("Não foi possível adicionar."),
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
            <p className="panel">{tr("Nenhum lugar corresponde a esta busca. Ajuste os filtros ou consulte outra região.")}</p>
          )}
          {places.length > limit && (
            <button
              className="secondary"
              onClick={() => setLimit((n) => n + 24)}
            >{tr("Mostrar mais lugares (")}{places.length - limit}{" "}{tr("restantes)")}</button>
          )}
          <p className="subtle">
            {result.provider === "wikipedia" && (
              <>
                {tr("Textos")}:{" "}
                <a
                  href="https://creativecommons.org/licenses/by-sa/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >{tr("Wikipédia · CC BY-SA")}</a>
                {" · "}
                <a
                  href="https://www.wikidata.org/wiki/Wikidata:Licensing"
                  target="_blank"
                  rel="noreferrer"
                >{tr("Wikidata · CC0")}</a>
                {" · "}
                {tr("Fotos: Wikimedia Commons, com autor e licença em cada foto.")}
              </>
            )}
            {(result.provider === "openstreetmap" || result.complemented) && (
              <>
                {" "}©{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >{tr("OpenStreetMap contributors · ODbL")}</a>
              </>
            )}{" "}
            {tr("Sem preços, avaliações ou horários gerados por IA.")}
          </p>
        </section>
      )}
    </>
  );
}
