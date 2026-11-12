import { useEffect, useRef, useState } from "react";
import { Calculator, ExternalLink, Plus, Route, Trash2, X } from "lucide-react";
import { t as tr, tf, formatMoney, formatNumber } from "../i18n";
import { uid, type Trip } from "../model";
import { linkedCost, setCost } from "./costs";
import { PlaceField } from "./PlaceField";
import { SecretInput } from "./SecretField";
import type { SecretStore } from "./secrets";
import { checkTransport, cleanTransport, legMinutes, saveTransport } from "./transport";
import { durationText, knownZones } from "./time";
import { checkInStatuses, roadKinds, transportKinds, type Leg, type Transport, type TransportKind } from "./types";
import { fuelEstimate, vehicleName } from "./vehicles";
import { drivingLinks, roadRoutes, routingCredit, routingEnabled } from "./routing";

const emptyLeg = (date = ""): Leg => ({ id: uid(), from: { name: "" }, to: { name: "" }, departDate: date, departTime: "", arriveDate: "", arriveTime: "" });
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? undefined : Number(s);
};

/** Add or edit one transport (any kind), including flights with connections and road trips. */
export function TransportForm({
  trip,
  initial,
  kind: startKind,
  store,
  onSave,
  onClose,
  busy,
}: {
  trip: Trip;
  initial?: Transport;
  kind?: TransportKind;
  store: SecretStore;
  onSave: (t: Trip) => Promise<boolean>;
  onClose: () => void;
  busy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Transport>(
    () => initial ?? { id: uid(), kind: startKind ?? "flight", legs: [emptyLeg(trip.start)], flight: startKind === "flight" || !startKind ? { checkInStatus: "unknown" } : undefined },
  );
  const [error, setError] = useState("");
  const [routes, setRoutes] = useState<NonNullable<Transport["road"]>["route"][]>([]);
  const [routing, setRouting] = useState(false);
  const [fuel, setFuel] = useState<{ price: string; text: string }>({ price: "", text: "" });
  const [removeCode, setRemoveCode] = useState(false);
  const zones = knownZones();
  const road = roadKinds.includes(draft.kind);
  const flight = draft.kind === "flight";
  const fare = linkedCost(trip, { transportId: draft.id }, "fare");
  const tolls = linkedCost(trip, { transportId: draft.id }, "tolls");
  const parking = linkedCost(trip, { transportId: draft.id }, "parking");
  const fuelCost = linkedCost(trip, { transportId: draft.id }, "fuel");
  const currency0 = fare?.currency ?? fuelCost?.currency ?? trip.budget?.currency ?? trip.expenses[0]?.currency ?? "EUR";

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
  }, []);

  const setLeg = (i: number, patch: Partial<Leg>) => setDraft((d) => ({ ...d, legs: d.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const setKind = (kind: TransportKind) =>
    setDraft((d) => ({
      ...d,
      kind,
      flight: kind === "flight" ? d.flight ?? { checkInStatus: "unknown" } : undefined,
      road: roadKinds.includes(kind) ? d.road ?? {} : undefined,
      legs: kind === "flight" ? d.legs : d.legs.slice(0, 1).map((l) => ({ ...l, carrier: kind === "train" || kind === "bus" || kind === "ferry" ? l.carrier : undefined })),
    }));
  const vehicles = trip.vehicles || [];
  const points = road ? [draft.legs[0]?.from.point, ...(draft.road?.via ?? []).map((v) => v.point), draft.legs[draft.legs.length - 1]?.to.point] : [];
  const routePoints = points.every(Boolean) ? (points as NonNullable<(typeof points)[number]>[]) : undefined;
  const links = routePoints ? drivingLinks(routePoints) : undefined;
  const firstVehicle = vehicles.find((v) => draft.road?.vehicleIds?.includes(v.id));

  async function findRoutes() {
    if (!routePoints) return;
    setRouting(true);
    setError("");
    try {
      const found = await roadRoutes(routePoints);
      setRoutes(found);
      pickRoute(found[0]!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Serviço de rotas indisponível.");
    } finally {
      setRouting(false);
    }
  }
  function pickRoute(r: NonNullable<Transport["road"]>["route"]) {
    if (!r) return;
    setDraft((d) => ({ ...d, road: { ...d.road, route: r, distanceKm: r.distanceKm, distanceSource: "route", durationMin: r.durationMin } }));
  }

  async function submit(form: HTMLFormElement) {
    setError("");
    const f = new FormData(form);
    try {
      const clean = cleanTransport(draft);
      if (!clean) throw new Error("Informe origem e destino.");
      const { errors } = checkTransport(trip, clean);
      if (errors.length) throw new Error(errors[0]);
      const currency = String(f.get("currency") || currency0);
      const secret = String(f.get("secret") ?? "").trim();
      let next = saveTransport(trip, { ...clean, hasSecret: removeCode ? undefined : clean.hasSecret || Boolean(secret) || undefined });
      const base = { currency, title: clean.title || [clean.legs[0].from.name, clean.legs[clean.legs.length - 1].to.name].join(" → "), date: clean.legs[0].departDate || undefined, kind: clean.kind };
      const ref = { transportId: clean.id };
      if (!road) next = setCost(next, ref, "fare", { ...base, planned: num(f.get("planned")), paid: num(f.get("paid")) });
      else {
        next = setCost(next, ref, "tolls", { ...base, planned: num(f.get("tolls")) });
        next = setCost(next, ref, "parking", { ...base, planned: num(f.get("parking")) });
        if (fuel.text) next = setCost(next, ref, "fuel", { ...base, planned: Number(fuel.text) });
      }
      // The code goes to the private store first; the trip only records that one exists.
      if (secret) await store.set(trip.id, clean.id, secret);
      if (removeCode) await store.remove(trip.id, clean.id);
      if (await onSave(next)) dialog.current?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  const estimate = () => {
    try {
      const km = draft.road?.distanceKm;
      const eff = firstVehicle?.efficiency;
      const price = Number(fuel.price.replace(",", "."));
      if (!km || !eff || !(price > 0)) throw new Error("Para estimar, informe a distância, um carro com consumo médio e o preço do litro.");
      const r = fuelEstimate({ km, consumption: eff, unit: "km_per_l", price, currency: (dialog.current?.querySelector("[name=currency]") as HTMLSelectElement)?.value || currency0 });
      setFuel({ ...fuel, text: String(r.cost) });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
    }
  };

  return (
    <dialog ref={dialog} className="journey-dialog" aria-labelledby="transport-title" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
      >
        <header className="journey-dialog-head">
          <h2 id="transport-title">{initial ? tr("Editar transporte") : tr("Novo transporte")}</h2>
          <button type="button" className="icon-button" onClick={() => dialog.current?.close()} aria-label={tr("Fechar")}>
            <X size={18} />
          </button>
        </header>
        <div className="journey-dialog-body">
          <fieldset className="kind-picker">
            <legend>{tr("Como você vai?")}</legend>
            {(Object.keys(transportKinds) as TransportKind[]).map((k) => (
              <label key={k} className={"kind-option" + (draft.kind === k ? " is-on" : "")}>
                <input type="radio" name="kind" value={k} checked={draft.kind === k} onChange={() => setKind(k)} />
                {tr(transportKinds[k])}
              </label>
            ))}
          </fieldset>
          <label>
            {tr("Nome")} <small>{tr("opcional")}</small>
            <input value={draft.title ?? ""} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={flight ? tr("Ex.: Ida para Lisboa") : tr("Ex.: Lisboa → Madrid")} />
          </label>

          {draft.legs.map((l, i) => {
            const minutes = legMinutes(trip, l);
            return (
              <fieldset key={l.id} className="leg-box">
                <legend>
                  {draft.legs.length > 1 ? tf("Trecho {number}", { number: i + 1 }) : tr("Trajeto")}
                  {minutes !== undefined && minutes > 0 && <span className="leg-duration">{tf("Duração: {time}", { time: durationText(minutes) })}</span>}
                </legend>
                {draft.legs.length > 1 && (
                  <button type="button" className="icon-button leg-remove" onClick={() => setDraft({ ...draft, legs: draft.legs.filter((x) => x.id !== l.id) })} aria-label={tf("Remover trecho {number}", { number: i + 1 })}>
                    <Trash2 size={15} />
                  </button>
                )}
                <div className="leg-grid">
                  <PlaceField label={flight ? tr("Aeroporto de origem") : tr("Origem")} value={l.from} onChange={(from) => setLeg(i, { from })} required />
                  <PlaceField label={flight ? tr("Aeroporto de destino") : tr("Destino")} value={l.to} onChange={(to) => setLeg(i, { to })} required />
                  {(flight || draft.kind === "train") && (
                    <div className="leg-codes">
                      <label>
                        {flight ? tr("IATA origem") : tr("Código")}
                        <input value={l.from.code ?? ""} maxLength={8} onChange={(e) => setLeg(i, { from: { ...l.from, code: e.target.value.toUpperCase() } })} placeholder={flight ? "CNF" : ""} />
                      </label>
                      <label>
                        {flight ? tr("IATA destino") : tr("Código")}
                        <input value={l.to.code ?? ""} maxLength={8} onChange={(e) => setLeg(i, { to: { ...l.to, code: e.target.value.toUpperCase() } })} placeholder={flight ? "LIS" : ""} />
                      </label>
                    </div>
                  )}
                  <div className="leg-when">
                    <label>
                      {tr("Partida")}
                      <input type="date" value={l.departDate} onChange={(e) => setLeg(i, { departDate: e.target.value })} />
                    </label>
                    <label>
                      {tr("Hora")}
                      <input type="time" value={l.departTime} onChange={(e) => setLeg(i, { departTime: e.target.value })} />
                    </label>
                    <label>
                      {tr("Fuso horário")}
                      <input list="journey-zones" value={l.departZone ?? ""} onChange={(e) => setLeg(i, { departZone: e.target.value })} placeholder={trip.timeZone || "Europe/Lisbon"} />
                    </label>
                  </div>
                  <div className="leg-when">
                    <label>
                      {tr("Chegada")}
                      <input type="date" value={l.arriveDate} onChange={(e) => setLeg(i, { arriveDate: e.target.value })} />
                    </label>
                    <label>
                      {tr("Hora")}
                      <input type="time" value={l.arriveTime} onChange={(e) => setLeg(i, { arriveTime: e.target.value })} />
                    </label>
                    <label>
                      {tr("Fuso horário")}
                      <input list="journey-zones" value={l.arriveZone ?? ""} onChange={(e) => setLeg(i, { arriveZone: e.target.value })} placeholder={trip.timeZone || "Europe/Madrid"} />
                    </label>
                  </div>
                  {!road && (
                    <div className="leg-extra">
                      <label>
                        {flight ? tr("Companhia aérea") : tr("Empresa")}
                        <input value={l.carrier ?? ""} maxLength={60} onChange={(e) => setLeg(i, { carrier: e.target.value })} />
                      </label>
                      <label>
                        {flight ? tr("Número do voo") : tr("Número")}
                        <input value={l.number ?? ""} maxLength={12} onChange={(e) => setLeg(i, { number: e.target.value })} placeholder={flight ? "TP 088" : ""} />
                      </label>
                      {flight && (
                        <>
                          <label>
                            {tr("Terminal")}
                            <input value={l.from.terminal ?? ""} maxLength={20} onChange={(e) => setLeg(i, { from: { ...l.from, terminal: e.target.value } })} />
                          </label>
                          <label>
                            {tr("Portão")}
                            <input value={l.gate ?? ""} maxLength={10} onChange={(e) => setLeg(i, { gate: e.target.value })} placeholder={tr("se souber")} />
                          </label>
                        </>
                      )}
                      <label>
                        {tr("Classe")}
                        <input value={l.cabin ?? ""} maxLength={40} onChange={(e) => setLeg(i, { cabin: e.target.value })} />
                      </label>
                      <label>
                        {tr("Assento")}
                        <input value={l.seat ?? ""} maxLength={12} onChange={(e) => setLeg(i, { seat: e.target.value })} />
                      </label>
                    </div>
                  )}
                </div>
              </fieldset>
            );
          })}
          {(flight || draft.kind === "train" || draft.kind === "bus" || draft.kind === "ferry") && (
            <button
              type="button"
              className="secondary small"
              onClick={() => {
                const last = draft.legs[draft.legs.length - 1];
                setDraft({ ...draft, legs: [...draft.legs, { ...emptyLeg(last.arriveDate || last.departDate), from: { ...last.to, terminal: undefined }, departZone: last.arriveZone }] });
              }}
            >
              <Plus size={15} /> {flight ? tr("Adicionar escala / trecho") : tr("Adicionar trecho")}
            </button>
          )}
          <datalist id="journey-zones">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>

          {road && (
            <section className="journey-sub">
              <h3>{tr("Carro e percurso")}</h3>
              {vehicles.length ? (
                <div className="pref-chips">
                  {vehicles.map((v) => (
                    <label key={v.id} className="pref-chip">
                      <input
                        type="checkbox"
                        checked={draft.road?.vehicleIds?.includes(v.id) ?? false}
                        onChange={(e) =>
                          setDraft({ ...draft, road: { ...draft.road, vehicleIds: e.target.checked ? [...(draft.road?.vehicleIds ?? []), v.id] : (draft.road?.vehicleIds ?? []).filter((x) => x !== v.id) } })
                        }
                      />
                      <span>{tr(vehicleName(v))}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="muted">{tr("Cadastre o carro em Veículos para usar o consumo dele nas estimativas.")}</p>
              )}
              <div className="road-distance">
                <label>
                  {tr("Distância por estrada (km)")}
                  <input
                    inputMode="decimal"
                    value={draft.road?.distanceKm ?? ""}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(",", "."));
                      setDraft({ ...draft, road: { ...draft.road, distanceKm: e.target.value === "" ? undefined : v, distanceSource: "manual", route: undefined, durationMin: undefined } });
                    }}
                    placeholder={tr("Ex.: 625")}
                  />
                </label>
                <button type="button" className="secondary small" onClick={findRoutes} disabled={!routePoints || !routingEnabled || routing}>
                  <Route size={15} /> {routing ? tr("Calculando…") : tr("Calcular rota")}
                </button>
              </div>
              {!routePoints && <p className="muted">{tr("Para calcular a rota, escolha origem e destino entre as sugestões. Sem isso, digite a quilometragem.")}</p>}
              {draft.road?.distanceSource === "route" && draft.road.route && (
                <p className="muted">
                  {tf("{km} km por estrada, cerca de {time} sem trânsito.", { km: formatNumber(draft.road.route.distanceKm, 1), time: durationText(draft.road.route.durationMin) })} {routingCredit}
                </p>
              )}
              {routes.length > 1 && (
                <div className="chip-row wrap" aria-label={tr("Rotas alternativas")}>
                  {routes.map((r, i) => (
                    <button type="button" key={i} className={"chip" + (draft.road?.route === r ? " is-on" : "")} aria-pressed={draft.road?.route === r} onClick={() => pickRoute(r)}>
                      {tf("Rota {number}: {km} km · {time}", { number: i + 1, km: formatNumber(r!.distanceKm, 0), time: durationText(r!.durationMin) })}
                    </button>
                  ))}
                </div>
              )}
              {links && (
                <p className="meal-links">
                  <a href={links.google} target="_blank" rel="noreferrer">
                    Google Maps <ExternalLink size={12} />
                  </a>
                  <a href={links.apple} target="_blank" rel="noreferrer">
                    Apple Maps <ExternalLink size={12} />
                  </a>
                </p>
              )}
            </section>
          )}

          <section className="journey-sub">
            <h3>{tr("Custos")}</h3>
            <div className="cost-grid">
              <label>
                {tr("Moeda")}
                <select name="currency" defaultValue={currency0}>
                  {[...new Set([currency0, "EUR", "BRL", "USD", "GBP"])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {!road ? (
                <>
                  <label>
                    {tr("Valor previsto")}
                    <input name="planned" inputMode="decimal" defaultValue={fare?.estimate ?? ""} placeholder="0,00" />
                  </label>
                  <label>
                    {tr("Valor pago")}
                    <input name="paid" inputMode="decimal" defaultValue={fare && fare.amount ? fare.amount : ""} placeholder="0,00" />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    {tr("Pedágios previstos")}
                    <input name="tolls" inputMode="decimal" defaultValue={tolls?.estimate ?? ""} placeholder={tr("Desconhecido")} />
                  </label>
                  <label>
                    {tr("Estacionamento previsto")}
                    <input name="parking" inputMode="decimal" defaultValue={parking?.estimate ?? ""} placeholder={tr("Desconhecido")} />
                  </label>
                </>
              )}
            </div>
            {road && (
              <div className="fuel-inline">
                <label>
                  {tr("Preço do litro")}
                  <input inputMode="decimal" value={fuel.price} onChange={(e) => setFuel({ ...fuel, price: e.target.value })} placeholder="1,70" />
                </label>
                <button type="button" className="secondary small" onClick={estimate}>
                  <Calculator size={15} /> {tr("Estimar combustível")}
                </button>
                {(fuel.text || fuelCost?.estimate) && (
                  <span className="muted">
                    {tf("Combustível previsto: {value} (estimativa)", { value: formatMoney(Number(fuel.text || fuelCost?.estimate), fuelCost?.currency ?? currency0) })}
                  </span>
                )}
              </div>
            )}
            <p className="muted">{tr("Os valores vão para o orçamento como previstos. Só conta como pago o que você informar como pago.")}</p>
          </section>

          {flight && (
            <section className="journey-sub">
              <h3>{tr("Bagagem e check-in")}</h3>
              <div className="cost-grid">
                <label>
                  {tr("Bagagem de mão")}
                  <input value={draft.flight?.cabinBag ?? ""} maxLength={80} onChange={(e) => setDraft({ ...draft, flight: { ...draft.flight, cabinBag: e.target.value } })} placeholder={tr("Ex.: 1 mala de 10 kg")} />
                </label>
                <label>
                  {tr("Bagagem despachada")}
                  <input value={draft.flight?.checkedBag ?? ""} maxLength={80} onChange={(e) => setDraft({ ...draft, flight: { ...draft.flight, checkedBag: e.target.value } })} placeholder={tr("Ex.: 2 × 23 kg")} />
                </label>
                <label>
                  {tr("Abertura do check-in")}
                  <input type="date" value={draft.flight?.checkInDate ?? ""} onChange={(e) => setDraft({ ...draft, flight: { ...draft.flight, checkInDate: e.target.value } })} />
                </label>
                <label>
                  {tr("Hora")}
                  <input type="time" value={draft.flight?.checkInTime ?? ""} onChange={(e) => setDraft({ ...draft, flight: { ...draft.flight, checkInTime: e.target.value } })} />
                </label>
                <label>
                  {tr("Status do check-in")}
                  <select value={draft.flight?.checkInStatus ?? "unknown"} onChange={(e) => setDraft({ ...draft, flight: { ...draft.flight, checkInStatus: e.target.value as keyof typeof checkInStatuses } })}>
                    {Object.entries(checkInStatuses).map(([k, v]) => (
                      <option key={k} value={k}>
                        {tr(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("Link oficial da companhia")}
                  <input type="url" value={draft.flight?.checkInUrl ?? ""} maxLength={500} onChange={(e) => setDraft({ ...draft, flight: { ...draft.flight, checkInUrl: e.target.value } })} placeholder="https://" />
                </label>
              </div>
              <p className="muted">{tr("Use o horário de abertura informado pela companhia. O app não inventa horários nem confirma status de voo.")}</p>
            </section>
          )}

          <section className="journey-sub">
            <h3>{tr("Passageiros e reserva")}</h3>
            {trip.participants?.length ? (
              <div className="pref-chips">
                {trip.participants.map((p) => (
                  <label key={p.id} className="pref-chip">
                    <input
                      type="checkbox"
                      checked={draft.passengers?.includes(p.id) ?? false}
                      onChange={(e) => setDraft({ ...draft, passengers: e.target.checked ? [...(draft.passengers ?? []), p.id] : (draft.passengers ?? []).filter((x) => x !== p.id) })}
                    />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted">{tr("Cadastre os viajantes no Orçamento para marcar quem vai em cada trecho.")}</p>
            )}
            <SecretInput has={draft.hasSecret && !removeCode} onRemove={() => setRemoveCode(true)} label={flight ? "Localizador / código da reserva (PNR)" : "Código da reserva"} />
            <div className="cost-grid">
              {trip.reservations.length > 0 && (
                <label>
                  {tr("Reserva vinculada")}
                  <select value={draft.reservationId ?? ""} onChange={(e) => setDraft({ ...draft, reservationId: e.target.value || undefined })}>
                    <option value="">{tr("Nenhuma")}</option>
                    {trip.reservations.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {(trip.documents ?? []).length > 0 && (
              <fieldset>
                <legend>{tr("Documentos")}</legend>
                <div className="pref-chips">
                  {(trip.documents ?? []).map((d) => (
                    <label key={d.id} className="pref-chip">
                      <input
                        type="checkbox"
                        checked={draft.documentIds?.includes(d.id) ?? false}
                        onChange={(e) => setDraft({ ...draft, documentIds: e.target.checked ? [...(draft.documentIds ?? []), d.id] : (draft.documentIds ?? []).filter((x) => x !== d.id) })}
                      />
                      <span>{d.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label>
              {tr("Observações")}
              <textarea value={draft.notes ?? ""} maxLength={1000} rows={2} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
          </section>
          {error && (
            <p role="alert" className="form-error">
              {tr(error)}
            </p>
          )}
        </div>
        <footer className="journey-dialog-foot">
          <button type="button" className="secondary" onClick={() => dialog.current?.close()}>
            {tr("Cancelar")}
          </button>
          <button className="primary" disabled={busy}>
            {busy ? tr("Salvando…") : tr("Salvar transporte")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
