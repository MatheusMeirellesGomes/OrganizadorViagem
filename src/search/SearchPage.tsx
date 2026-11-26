import { useEffect, useState } from "react";
import { BedDouble, Car, Check, ExternalLink, Plane, Plus, Ticket, Trophy } from "lucide-react";
import type { Trip } from "../model";
import { formatMoney, t as tr, tf } from "../i18n";
import { searchKinds, type SearchKind } from "./links";
import { addOption, chooseOption, optionsOf } from "./options";
import "./search.css";

/*
 * Pesquisar e comparar: abre os sites de busca já preenchidos com os dados da
 * viagem e guarda as opções que a pessoa encontrou para comparar lado a lado.
 */

const icons: Record<SearchKind, typeof Plane> = { flights: Plane, hotels: BedDouble, cars: Car, experiences: Ticket };
const originKey = "gomes-origem-voos";
const readOrigin = () => {
  try {
    return localStorage.getItem(originKey) || "";
  } catch {
    return "";
  }
};

export function SearchPage({ trips, onSave, busy, initialKind = "flights", onOpen }: { trips: Trip[]; onSave: (t: Trip) => Promise<boolean | void> | void; busy?: boolean; initialKind?: SearchKind; onOpen: (t: Trip, tab: string) => void }) {
  const upcoming = trips.filter((t) => t.status !== "past");
  const [kind, setKind] = useState<SearchKind>(initialKind);
  const [tripId, setTripId] = useState(upcoming[0]?.id ?? "");
  const trip = trips.find((t) => t.id === tripId);
  const [origin, setOrigin] = useState(readOrigin);
  const [destination, setDestination] = useState(trip?.destination ?? "");
  const [start, setStart] = useState(trip?.start ?? "");
  const [end, setEnd] = useState(trip?.end ?? "");
  const [adults, setAdults] = useState(trip?.party?.adults || 2);
  const [children, setChildren] = useState(trip?.party?.children || 0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => setKind(initialKind), [initialKind]);
  // Trocar de viagem preenche destino, datas e pessoas de novo.
  useEffect(() => {
    if (!trip) return;
    setDestination(trip.destination);
    setStart(trip.start);
    setEnd(trip.end);
    setAdults(trip.party?.adults || 2);
    setChildren(trip.party?.children || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);
  useEffect(() => {
    try {
      localStorage.setItem(originKey, origin.trim().slice(0, 60));
    } catch {
      // Sem armazenamento: só não lembra a origem.
    }
  }, [origin]);

  const info = searchKinds[kind];
  const links = destination.trim() ? info.links({ origin, destination, start, end, adults, children }) : [];
  const options = trip ? optionsOf(trip, info.category) : [];
  const cheapest = options.find((o) => o.price !== undefined);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!trip) return;
    const f = new FormData(e.currentTarget);
    const raw = String(f.get("price") || "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const price = raw ? Number(raw) : undefined;
    setError("");
    setMessage("");
    if (price !== undefined && !(price >= 0)) return setError(tr("Confira o preço: use só números."));
    try {
      const next = addOption(trip, info.category, { title: String(f.get("title") || ""), url: String(f.get("url") || ""), price, currency: String(f.get("currency") || "BRL"), notes: String(f.get("notes") || "") });
      const form = e.currentTarget;
      if ((await onSave(next)) !== false) {
        form.reset();
        setMessage(tr("Opção salva. Ela também aparece na Central de Reservas como “Em pesquisa”."));
      }
    } catch (err) {
      setError(tr((err as Error).message));
    }
  }

  return (
    <div className="search-page">
      <div className="search-kinds" role="tablist" aria-label={tr("O que pesquisar")}>
        {(Object.keys(searchKinds) as SearchKind[]).map((k) => {
          const Icon = icons[k];
          return (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={"search-kind k-" + k + (kind === k ? " on" : "")} onClick={() => setKind(k)}>
              <span aria-hidden="true">
                <Icon size={20} />
              </span>
              {tr(searchKinds[k].label)}
            </button>
          );
        })}
      </div>

      <section className="panel search-form" aria-labelledby="search-title">
        <h2 id="search-title">{tf("Pesquisar {what}", { what: tr(info.label).toLowerCase() })}</h2>
        <div className="search-fields">
          {upcoming.length > 0 && (
            <label>
              {tr("Viagem")}
              <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
                <option value="">{tr("Nenhuma (só pesquisar)")}</option>
                {upcoming.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "flights" && (
            <label>
              {tr("Saindo de")}
              <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder={tr("Ex.: GRU ou São Paulo")} autoComplete="off" />
            </label>
          )}
          <label>
            {kind === "flights" ? tr("Indo para") : tr("Destino")}
            <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={kind === "flights" ? tr("Ex.: LIS ou Lisboa") : tr("Cidade ou região")} />
          </label>
          <label>
            {kind === "hotels" ? tr("Entrada") : kind === "cars" ? tr("Retirada") : tr("Ida")}
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            {kind === "hotels" ? tr("Saída") : kind === "cars" ? tr("Devolução") : tr("Volta")}
            <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
          {kind !== "cars" && (
            <>
              <label>
                {tr("Adultos")}
                <input type="number" min={1} max={9} value={adults} onChange={(e) => setAdults(Math.max(1, Math.min(9, Number(e.target.value) || 1)))} />
              </label>
              <label>
                {tr("Crianças")}
                <input type="number" min={0} max={8} value={children} onChange={(e) => setChildren(Math.max(0, Math.min(8, Number(e.target.value) || 0)))} />
              </label>
            </>
          )}
        </div>
        {links.length ? (
          <ul className="search-links">
            {links.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  <b>{l.name}</b>
                  <span>{l.note ? tr(l.note) : tr("Abre já preenchido")}</span>
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="search-hint">{tr("Escreva o destino para ver onde pesquisar.")}</p>
        )}
        <p className="search-hint">{tr("Preços e disponibilidade são conferidos no próprio site. A Gomes pelo Mundo não cobra nada e não recebe comissão por esses links.")}</p>
      </section>

      <section className="panel search-compare" aria-labelledby="compare-title">
        <h2 id="compare-title">{tr("Opções para comparar")}</h2>
        {!trip ? (
          <p className="search-hint">{upcoming.length ? tr("Escolha uma viagem acima para salvar e comparar opções.") : tr("Crie uma viagem para salvar e comparar as opções que encontrar.")}</p>
        ) : (
          <>
            <p className="search-hint">{tf("Achou algo bom? Salve aqui com o preço que viu. As opções ficam na viagem {trip}, em Reservas, sem entrar nas despesas.", { trip: trip.title })}</p>
            <form className="search-add" onSubmit={add}>
              <label>
                {tr("Nome da opção")}
                <input name="title" required maxLength={120} placeholder={kind === "flights" ? tr("Ex.: TAP direto, 10h de voo") : kind === "hotels" ? tr("Ex.: Hotel Alfama, café incluso") : kind === "cars" ? tr("Ex.: Localiza, compacto automático") : tr("Ex.: Tour pelo Douro")} />
              </label>
              <label>
                {tr("Link")}
                <input name="url" type="url" inputMode="url" placeholder="https://" />
              </label>
              <label className="search-price">
                {tr("Preço total")}
                <span>
                  <input name="price" inputMode="decimal" placeholder="0,00" />
                  <select name="currency" defaultValue={trip.budget?.currency || "BRL"} aria-label={tr("Moeda")}>
                    {["BRL", "USD", "EUR", "GBP", "ARS", "CLP", "JPY", "CHF", "CAD", "AUD", "MXN"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="search-notes">
                {tr("Observações")}
                <input name="notes" maxLength={500} placeholder={tr("Ex.: cancelamento grátis até 3 dias antes")} />
              </label>
              <button className="primary" disabled={busy}>
                <Plus size={16} /> {tr("Salvar opção")}
              </button>
            </form>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="search-ok" role="status">{message}</p>}
            {options.length > 0 && (
              <ul className="search-options">
                {options.map((o) => (
                  <li key={o.id} className={o.status === "reserved" || o.status === "confirmed" ? "chosen" : ""}>
                    <div>
                      <b>{o.title}</b>
                      {o.notes && <small>{o.notes}</small>}
                      {o === cheapest && options.filter((x) => x.price !== undefined).length > 1 && (
                        <em className="search-best">
                          <Trophy size={13} aria-hidden="true" /> {tr("Menor preço")}
                        </em>
                      )}
                    </div>
                    <strong>{o.price !== undefined && o.currency ? formatMoney(o.price, o.currency) : tr("Sem preço")}</strong>
                    <span className="search-option-actions">
                      {o.url && (
                        <a className="secondary" href={o.url} target="_blank" rel="noopener noreferrer">
                          {tr("Ver site")} <ExternalLink size={14} aria-hidden="true" />
                        </a>
                      )}
                      {o.status === "researching" ? (
                        <button type="button" className="secondary" disabled={busy} onClick={() => void onSave(chooseOption(trip, o.id))}>
                          <Check size={15} /> {tr("Reservei esta")}
                        </button>
                      ) : (
                        <span className="search-chosen">
                          <Check size={15} aria-hidden="true" /> {tr("Reservada")}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {options.length > 0 && (
              <button type="button" className="text-button" onClick={() => onOpen(trip, "Reservas")}>
                {tr("Editar ou remover opções na viagem")}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
