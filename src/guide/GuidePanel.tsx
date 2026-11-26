import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, BookOpen, Car, Clock, Coins, ExternalLink, Languages, Phone, Plug, RefreshCw, Ruler, ShieldAlert } from "lucide-react";
import type { Trip } from "../model";
import { formatMoney, formatNumber, getLocale, t as tr, tf } from "../i18n";
import { countryName, flag, tripCountries } from "../profile/passport";
import { countryFacts, ecbCurrencies, phraseKeys, phrases } from "./data";
import { cached, forecast, geocode, latestRate, remember, weatherLabel, wikiSummary, type DayWeather, type Place, type Rate, type Summary } from "./services";
import { convertUnit, parseAmount, timeIn, units, zoneDiff, type Unit } from "./tools";
import "./guide.css";

const HOUR = 3600000;
const fresh = (at: string | undefined, maxH: number) => Boolean(at && Date.now() - Date.parse(at) < maxH * HOUR);
const shortDay = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", timeZone: "UTC" });
const wikiLang = () => (getLocale() === "en" ? "en" : getLocale() === "es" ? "es" : "pt");

export function GuidePanel({ trip }: { trip: Trip }) {
  const destination = (trip.destination || "").trim();
  const key = trip.id + ":" + destination.toLowerCase();
  const [place, setPlace] = useState<Place | undefined>(() => cached<Place>("geo:" + key)?.value);
  const [weather, setWeather] = useState(() => cached<DayWeather[]>("tempo:" + key));
  const [wiki, setWiki] = useState(() => cached<Summary | null>("wiki:" + wikiLang() + ":" + key));
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(() => new Date());

  const code = tripCountries(trip)[0] ?? place?.countryCode;
  const facts = code ? countryFacts[code] : undefined;
  const zone = trip.timeZone || place?.timezone;
  const point = trip.coordinates ?? (place ? { lat: place.lat, lng: place.lng } : undefined);

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(i);
  }, []);

  async function load(force = false) {
    if (!destination) return;
    if (!navigator.onLine) return setStatus(tr("Sem internet: mostrando o que foi salvo da última vez."));
    setStatus("");
    try {
      let p = place;
      if (!p || force) {
        p = await geocode(destination, wikiLang());
        if (p) {
          setPlace(p);
          remember("geo:" + key, p);
        }
      }
      const at = trip.coordinates ?? (p ? { lat: p.lat, lng: p.lng } : undefined);
      if (at && (force || !fresh(weather?.at, 3))) {
        const w = await forecast(at.lat, at.lng);
        remember("tempo:" + key, w);
        setWeather({ value: w, at: new Date().toISOString() });
      }
      const wk = "wiki:" + wikiLang() + ":" + key;
      if (force || !fresh(wiki?.at, 24 * 7)) {
        const s = (await wikiSummary(p?.name || destination, wikiLang())) ?? null;
        remember(wk, s);
        setWiki({ value: s, at: new Date().toISOString() });
      }
    } catch {
      setStatus(tr("Não foi possível atualizar agora. Mostrando o que foi salvo da última vez."));
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!destination)
    return (
      <section className="panel guide-empty">
        <BookOpen size={28} aria-hidden="true" />
        <p>{tr("Defina o destino da viagem para ver o guia: clima, câmbio, fuso, tomadas, emergência e frases úteis.")}</p>
      </section>
    );

  const diff = zone ? zoneDiff(zone, now) : undefined;
  const localTime = zone ? timeIn(zone, now, getLocale()) : undefined;

  return (
    <div className="guide">
      <section className="guide-intro panel">
        {wiki?.value?.image && <img className="guide-photo" src={wiki.value.image} alt="" loading="lazy" />}
        <div>
          <span className="guide-label">
            {code && <span aria-hidden="true">{flag(code)} </span>}
            {code ? countryName(code, getLocale()) : tr("Guia do destino")}
          </span>
          <h2>{wiki?.value?.title || place?.name || destination}</h2>
          {wiki?.value ? (
            <>
              <p>{wiki.value.text}</p>
              <a className="guide-source" href={wiki.value.url} target="_blank" rel="noopener noreferrer">
                {tr("Texto da Wikipédia (CC BY-SA)")} <ExternalLink size={13} aria-hidden="true" />
              </a>
            </>
          ) : (
            <p className="guide-muted">{wiki ? tr("A Wikipédia não tem um resumo para esse nome de destino.") : tr("Carregando o resumo do destino…")}</p>
          )}
        </div>
        <button type="button" className="icon-button guide-refresh" aria-label={tr("Atualizar guia")} onClick={() => void load(true)}>
          <RefreshCw size={17} />
        </button>
        {status && (
          <p className="guide-status" role="status">
            {status}
          </p>
        )}
      </section>

      <ul className="guide-facts" aria-label={tr("Informações práticas")}>
        <li>
          <Clock size={18} aria-hidden="true" />
          <span>
            <small>{tr("Hora local")}</small>
            <b>{localTime ?? tr("Sem fuso definido")}</b>
            {diff !== undefined && <em>{diff === 0 ? tr("Mesmo horário que aqui") : tf(diff > 0 ? "{n} h à frente daqui" : "{n} h atrás daqui", { n: formatNumber(Math.abs(diff), Math.abs(diff) % 1 ? 1 : 0) })}</em>}
          </span>
        </li>
        <li>
          <Coins size={18} aria-hidden="true" />
          <span>
            <small>{tr("Moeda")}</small>
            <b>{facts?.currency ?? tr("Não informado")}</b>
          </span>
        </li>
        <li>
          <Plug size={18} aria-hidden="true" />
          <span>
            <small>{tr("Tomadas")}</small>
            <b>{facts ? tf("Tipo {plugs}", { plugs: facts.plugs }) : tr("Não informado")}</b>
            {facts && <em>{tr(facts.voltage)}</em>}
          </span>
        </li>
        <li>
          <Car size={18} aria-hidden="true" />
          <span>
            <small>{tr("Trânsito")}</small>
            <b>{facts ? (facts.drive === "left" ? tr("Mão inglesa (dirige-se à esquerda)") : tr("Dirige-se à direita")) : tr("Não informado")}</b>
          </span>
        </li>
      </ul>

      <section className="panel guide-weather" aria-labelledby="g-weather">
        <h3 id="g-weather">{tr("Clima nos próximos 7 dias")}</h3>
        {weather?.value?.length ? (
          <>
            <ul tabIndex={0} aria-label={tr("Previsão por dia")}>
              {weather.value.map((d) => {
                const w = weatherLabel(d.code);
                return (
                  <li key={d.date}>
                    <small>{shortDay(d.date)}</small>
                    <span className="guide-wicon" role="img" aria-label={tr(w.label)}>
                      {w.icon}
                    </span>
                    <b>{Math.round(d.max)}°</b>
                    <small>{Math.round(d.min)}°</small>
                    {d.rain !== undefined && <em>💧 {d.rain}%</em>}
                  </li>
                );
              })}
            </ul>
            <p className="guide-muted">
              {tf("Previsão do Open-Meteo, atualizada em {date}. Para datas mais distantes, confira de novo perto da viagem.", { date: new Date(weather.at).toLocaleString(getLocale(), { dateStyle: "short", timeStyle: "short" }) })}
            </p>
          </>
        ) : (
          <p className="guide-muted">{point ? tr("Carregando a previsão…") : tr("Não encontramos esse destino no mapa para buscar o clima.")}</p>
        )}
      </section>

      <div className="guide-grid">
        <Exchange to={facts?.currency} home={trip.budget?.currency || "BRL"} tripId={trip.id} />
        <section className="panel guide-emergency" aria-labelledby="g-sos">
          <h3 id="g-sos">
            <ShieldAlert size={18} aria-hidden="true" /> {tr("Emergência")}
          </h3>
          {facts ? (
            <ul>
              {(
                [
                  ["general", "Emergência geral"],
                  ["police", "Polícia"],
                  ["ambulance", "Ambulância"],
                  ["fire", "Bombeiros"],
                ] as const
              )
                .filter(([k]) => facts.emergency[k])
                .map(([k, label]) => (
                  <li key={k}>
                    <span>{tr(label)}</span>
                    {facts.emergency[k]!.split(" ou ").map((n) => (
                      <a key={n} href={"tel:" + n} className="guide-tel">
                        <Phone size={14} aria-hidden="true" /> {n}
                      </a>
                    ))}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="guide-muted">{tr("Ainda não temos os números deste país. Confira no site oficial de turismo ou com o hotel ao chegar.")}</p>
          )}
          <a className="guide-source" href="https://www.gov.br/mre/pt-br/assuntos/portal-consular" target="_blank" rel="noopener noreferrer">
            {tr("Portal Consular do Itamaraty (para brasileiros)")} <ExternalLink size={13} aria-hidden="true" />
          </a>
        </section>
      </div>

      <div className="guide-grid">
        <Phrases initial={facts?.language} />
        <Units />
      </div>
    </div>
  );
}

function Exchange({ to, home, tripId }: { to?: string; home: string; tripId: string }) {
  const [from, setFrom] = useState(to && to !== home ? to : "EUR");
  const [target, setTarget] = useState(home);
  const [amount, setAmount] = useState("100");
  const [rate, setRate] = useState(() => cached<Rate>(`cambio:${from}:${target}`));
  const [error, setError] = useState("");
  const list = useMemo(() => [...new Set([home, ...(to ? [to] : []), ...ecbCurrencies])].sort(), [home, to]);
  const unsupported = !ecbCurrencies.includes(from) || !ecbCurrencies.includes(target);

  useEffect(() => {
    const c = cached<Rate>(`cambio:${from}:${target}`);
    setRate(c);
    setError("");
    if (unsupported || fresh(c?.at, 12) || !navigator.onLine) return;
    latestRate(from, target)
      .then((r) => {
        remember(`cambio:${from}:${target}`, r);
        setRate({ value: r, at: new Date().toISOString() });
      })
      .catch(() => setError(tr("Não foi possível buscar a cotação agora.")));
  }, [from, target, unsupported, tripId]);

  const n = parseAmount(amount);
  return (
    <section className="panel guide-exchange" aria-labelledby="g-fx">
      <h3 id="g-fx">
        <Coins size={18} aria-hidden="true" /> {tr("Câmbio")}
      </h3>
      <div className="guide-fx-row">
        <label>
          {tr("Valor")}
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          {tr("De")}
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {list.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button type="button" className="icon-button guide-swap" aria-label={tr("Inverter moedas")} onClick={() => { setFrom(target); setTarget(from); }}>
          <ArrowLeftRight size={17} />
        </button>
        <label>
          {tr("Para")}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {list.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {unsupported ? (
        <p className="guide-muted">{tr("O Banco Central Europeu não publica cotação para essa moeda. Use a cotação da sua casa de câmbio ou do cartão.")}</p>
      ) : rate && n !== undefined ? (
        <>
          <p className="guide-fx-result" aria-live="polite">
            {formatMoney(n, from)} ≈ <b>{formatMoney(n * rate.value.rate, target)}</b>
          </p>
          <p className="guide-muted">{tf("Cotação de referência do Banco Central Europeu de {date} (via Frankfurter). Bancos e cartões cobram taxas e IOF à parte.", { date: new Date(rate.value.date + "T12:00:00Z").toLocaleDateString(getLocale(), { timeZone: "UTC" }) })}</p>
        </>
      ) : (
        <p className="guide-muted">{error || tr("Carregando a cotação…")}</p>
      )}
    </section>
  );
}

function Phrases({ initial }: { initial?: string }) {
  const start = initial && phrases[initial] ? initial : "en";
  const [lang, setLang] = useState(start);
  useEffect(() => setLang(start), [start]);
  const p = phrases[lang];
  return (
    <section className="panel guide-phrases" aria-labelledby="g-phrases">
      <div className="guide-phrases-head">
        <h3 id="g-phrases">
          <Languages size={18} aria-hidden="true" /> {tr("Frases úteis")}
        </h3>
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={tr("Idioma das frases")}>
          {Object.entries(phrases).map(([k, v]) => (
            <option key={k} value={k}>
              {tr(v.name)}
            </option>
          ))}
        </select>
      </div>
      {initial === "pt" ? (
        <p className="guide-muted">{tr("O idioma local é o português. Escolha outro idioma acima se precisar.")}</p>
      ) : (
        initial && !phrases[initial] && <p className="guide-muted">{tr("Ainda não temos frases no idioma local; mostrando em inglês.")}</p>
      )}
      <dl>
        {phraseKeys.map((k, i) => (
          <div key={k}>
            <dt>{tr(k)}</dt>
            <dd lang={lang}>
              {p.list[i]}
              {p.romaji && <small lang={lang + "-Latn"}>{p.romaji[i]}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Units() {
  const [unit, setUnit] = useState<Unit>("km");
  const [value, setValue] = useState("10");
  const n = value.trim() ? Number(value.trim().replace(",", ".")) : undefined;
  return (
    <section className="panel guide-units" aria-labelledby="g-units">
      <h3 id="g-units">
        <Ruler size={18} aria-hidden="true" /> {tr("Conversor de medidas")}
      </h3>
      <div className="guide-fx-row">
        <label>
          {tr("Valor")}
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className="guide-unit-pick">
          {tr("Converter")}
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {(Object.keys(units) as Unit[]).map((u) => (
              <option key={u} value={u}>
                {tr(units[u].label)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="guide-fx-result" aria-live="polite">
        {n !== undefined && Number.isFinite(n) ? (
          <>
            = <b>{formatNumber(convertUnit(unit, n), 2)} {units[unit].to}</b>
          </>
        ) : (
          tr("Digite um número")
        )}
      </p>
    </section>
  );
}
