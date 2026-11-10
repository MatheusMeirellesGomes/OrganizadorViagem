import { useState } from "react";
import { MapPin, Search, Compass } from "lucide-react";
import { TravelMap } from "./TravelMap";
import type { Trip } from "./model";
import { categories, feeLabel, type Place, type Point } from "./places";
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
        <dt>Endereço</dt>
        <dd>
          {[p.address, p.city, p.country].filter(Boolean).join(" · ") ||
            "Não informado"}
        </dd>
        <dt>Entrada</dt>
        <dd>
          {feeLabel(p)}
          {p.tags.charge && (
            <p>Valor cadastrado (confirme na fonte): {p.tags.charge}</p>
          )}
        </dd>
        <dt>Horários</dt>
        <dd>
          {p.tags.opening_hours
            ? `${p.tags.opening_hours} · Cadastro colaborativo, confirme antes de ir.`
            : "Consultar site oficial"}
        </dd>
        {[
          ["Descrição", p.tags["description:pt"] || p.tags.description],
          ["Nome alternativo", p.tags.alt_name],
          ["Acessibilidade", p.tags.wheelchair],
          ["Banheiros", p.tags.toilets],
          ["Reserva", p.tags.reservation],
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
        {p.website && (
          <a href={p.website} target="_blank" rel="noreferrer">
            Site cadastrado
          </a>
        )}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${p.coordinates.lat},${p.coordinates.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          Como chegar
        </a>
        <a href={p.source} target="_blank" rel="noreferrer">
          Ver fonte
        </a>
      </div>
      <p className="subtle">
        Consultado em {new Date(p.retrievedAt).toLocaleString("pt-BR")}
        {p.updatedAt
          ? " · Registro editado em " +
            new Date(p.updatedAt).toLocaleDateString("pt-BR")
          : ""}
        . Dados podem mudar.
      </p>
    </details>
  );
}
export function Catalog({ trips }: { trips: Trip[] }) {
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
  const places = (result?.places || []).filter(
    (p) =>
      (category === "all" || p.category === category) &&
      (!query ||
        p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
      (fee === "all" || p.tags.fee === fee),
  );
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
        <form
          className="catalog-search"
          onSubmit={(e) => {
            e.preventDefault();
            void locate();
          }}
        >
          <label>
            Cidade ou destino
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Ex.: Madrid"
            />
          </label>
          <button className="secondary" disabled={busy}>
            <Search size={17} />
            Localizar
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
            Raio da busca
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
                const r = await searchCatalog(point, radius, "attractions");
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
            {busy ? "Consultando…" : "Buscar atrações nesta região"}
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
            encodeURIComponent(destination || "atrações turísticas")
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
                {new Date(result.retrievedAt).toLocaleString("pt-BR")}
              </p>
            </div>
          </div>
          <div className="catalog-filters">
            <label>
              Filtrar por nome
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(24);
                }}
              />
            </label>
            <label>
              Categoria
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setLimit(24);
                }}
              >
                <option value="all">Todas as categorias</option>
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
              Entrada
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
          <div className="catalog-grid">
            {places.slice(0, limit).map((p) => (
              <article className="panel place-card" key={p.id}>
                <span className="eyebrow">{categories[p.category]}</span>
                <h3>{p.name}</h3>
                <p>{feeLabel(p)}</p>
                <PlaceDetails place={p} />
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
