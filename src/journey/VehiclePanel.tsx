import { useEffect, useRef, useState } from "react";
import { Calculator, Car, Pencil, Plus, Scale, Trash2, X } from "lucide-react";
import { t as tr, tf, formatMoney, formatNumber } from "../i18n";
import type { Trip } from "../model";
import { toMajor } from "../budget";
import { linkedCost, setCost } from "./costs";
import { SecretInput, SecretView } from "./SecretField";
import type { SecretStore } from "./secrets";
import { fuelKinds, type Vehicle } from "./types";
import {
  compareOptions,
  fuelEstimate,
  newOption,
  removeVehicle,
  saveVehicle,
  vehicleName,
  type CarChoice,
  type Comparison,
  type ConsumptionUnit,
} from "./vehicles";

const num = (v: FormDataEntryValue | string | null | undefined) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? undefined : Number(s);
};
const currencies = (trip: Trip, first?: string) => [...new Set([first ?? trip.budget?.currency ?? "EUR", "EUR", "BRL", "USD", "GBP"])];

function VehicleForm({ trip, initial, store, onSave, onClose, busy }: { trip: Trip; initial?: Vehicle; store: SecretStore; onSave: (t: Trip) => Promise<boolean>; onClose: () => void; busy: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [ownership, setOwnership] = useState<Vehicle["ownership"]>(initial?.ownership ?? "rental");
  const [error, setError] = useState("");
  const [removeCode, setRemoveCode] = useState(false);
  const id = initial?.id ?? crypto.randomUUID();
  const rentalCost = linkedCost(trip, { vehicleId: id }, "rental");
  const r = initial?.rental ?? {};
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  async function submit(form: HTMLFormElement) {
    setError("");
    const f = new FormData(form);
    const g = (k: string) => String(f.get(k) ?? "");
    const secret = g("secret").trim();
    try {
      let next = saveVehicle(trip, {
        id,
        ownership,
        label: g("label"),
        make: g("make"),
        model: g("model"),
        year: g("year"),
        category: g("category"),
        fuel: g("fuel") || undefined,
        efficiency: g("efficiency"),
        seats: g("seats"),
        bags: g("bags"),
        hasSecret: removeCode ? undefined : initial?.hasSecret || Boolean(secret) || undefined,
        rental: {
          company: g("company"),
          pickupPlace: g("pickupPlace"),
          pickupDate: g("pickupDate"),
          pickupTime: g("pickupTime"),
          dropoffPlace: g("dropoffPlace"),
          dropoffDate: g("dropoffDate"),
          dropoffTime: g("dropoffTime"),
          insurance: g("insurance"),
          deductible: g("deductible"),
          deposit: g("deposit"),
          currency: g("currency"),
          drivers: g("drivers"),
          countries: g("countries"),
          winterEquipment: f.get("winter") === "on",
        },
      });
      const v = next.vehicles!.find((x) => x.id === id)!;
      if (ownership === "rental")
        next = setCost(next, { vehicleId: id }, "rental", {
          planned: num(f.get("rentalPlanned")),
          paid: num(f.get("rentalPaid")),
          currency: g("currency") || "EUR",
          title: vehicleName(v),
          date: v.rental?.pickupDate,
        });
      if (secret) await store.set(trip.id, id, secret);
      if (removeCode) await store.remove(trip.id, id);
      if (await onSave(next)) dialog.current?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }
  return (
    <dialog ref={dialog} className="journey-dialog" aria-labelledby="vehicle-title" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
      >
        <header className="journey-dialog-head">
          <h2 id="vehicle-title">{initial ? tr("Editar veículo") : tr("Novo veículo")}</h2>
          <button type="button" className="icon-button" onClick={() => dialog.current?.close()} aria-label={tr("Fechar")}>
            <X size={18} />
          </button>
        </header>
        <div className="journey-dialog-body">
          <fieldset className="kind-picker">
            <legend>{tr("O carro é")}</legend>
            {(["rental", "own"] as const).map((k) => (
              <label key={k} className={"kind-option" + (ownership === k ? " is-on" : "")}>
                <input type="radio" name="ownership" checked={ownership === k} onChange={() => setOwnership(k)} />
                {k === "rental" ? tr("Carro alugado") : tr("Carro próprio")}
              </label>
            ))}
          </fieldset>
          <div className="cost-grid">
            <label>
              {tr("Apelido")} <small>{tr("opcional")}</small>
              <input name="label" defaultValue={initial?.label} maxLength={80} placeholder={tr("Ex.: Carro A")} />
            </label>
            <label>
              {tr("Marca")}
              <input name="make" defaultValue={initial?.make} maxLength={40} />
            </label>
            <label>
              {tr("Modelo")}
              <input name="model" defaultValue={initial?.model} maxLength={40} />
            </label>
            <label>
              {tr("Ano")}
              <input name="year" inputMode="numeric" defaultValue={initial?.year} maxLength={4} />
            </label>
            <label>
              {tr("Categoria")}
              <input name="category" defaultValue={initial?.category} maxLength={40} placeholder={tr("Ex.: SUV 7 lugares")} />
            </label>
            <label>
              {tr("Combustível")}
              <select name="fuel" defaultValue={initial?.fuel ?? ""}>
                <option value="">{tr("Não informado")}</option>
                {Object.entries(fuelKinds).map(([k, v]) => (
                  <option key={k} value={k}>
                    {tr(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Consumo médio (km/L)")}
              <input name="efficiency" inputMode="decimal" defaultValue={initial?.efficiency} placeholder="12,5" />
            </label>
            <label>
              {tr("Passageiros")}
              <input name="seats" inputMode="numeric" defaultValue={initial?.seats} placeholder="5" />
            </label>
            <label>
              {tr("Malas")}
              <input name="bags" inputMode="numeric" defaultValue={initial?.bags} placeholder="3" />
            </label>
          </div>
          {ownership === "rental" && (
            <section className="journey-sub">
              <h3>{tr("Locação")}</h3>
              <div className="cost-grid">
                <label>
                  {tr("Locadora")}
                  <input name="company" defaultValue={r.company} maxLength={60} />
                </label>
                <label>
                  {tr("Local de retirada")}
                  <input name="pickupPlace" defaultValue={r.pickupPlace} maxLength={120} />
                </label>
                <label>
                  {tr("Retirada")}
                  <input type="date" name="pickupDate" defaultValue={r.pickupDate} />
                </label>
                <label>
                  {tr("Hora")}
                  <input type="time" name="pickupTime" defaultValue={r.pickupTime} />
                </label>
                <label>
                  {tr("Local de devolução")}
                  <input name="dropoffPlace" defaultValue={r.dropoffPlace} maxLength={120} />
                </label>
                <label>
                  {tr("Devolução")}
                  <input type="date" name="dropoffDate" defaultValue={r.dropoffDate} />
                </label>
                <label>
                  {tr("Hora")}
                  <input type="time" name="dropoffTime" defaultValue={r.dropoffTime} />
                </label>
                <label>
                  {tr("Moeda")}
                  <select name="currency" defaultValue={r.currency ?? rentalCost?.currency}>
                    {currencies(trip, r.currency ?? rentalCost?.currency).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("Aluguel previsto")}
                  <input name="rentalPlanned" inputMode="decimal" defaultValue={rentalCost?.estimate ?? ""} placeholder={tr("Desconhecido")} />
                </label>
                <label>
                  {tr("Aluguel pago")}
                  <input name="rentalPaid" inputMode="decimal" defaultValue={rentalCost?.amount || ""} placeholder="0,00" />
                </label>
                <label>
                  {tr("Seguro")}
                  <input name="insurance" defaultValue={r.insurance} maxLength={120} placeholder={tr("Ex.: cobertura total")} />
                </label>
                <label>
                  {tr("Franquia")}
                  <input name="deductible" inputMode="decimal" defaultValue={r.deductible} placeholder={tr("Desconhecido")} />
                </label>
                <label>
                  {tr("Caução")}
                  <input name="deposit" inputMode="decimal" defaultValue={r.deposit} placeholder={tr("Desconhecido")} />
                </label>
                <label>
                  {tr("Motoristas autorizados")}
                  <input name="drivers" defaultValue={r.drivers?.join(", ")} placeholder={tr("Separe por vírgulas")} />
                </label>
                <label>
                  {tr("Países permitidos")}
                  <input name="countries" defaultValue={r.countries?.join(", ")} placeholder={tr("Ex.: Portugal, Espanha")} />
                </label>
              </div>
              <label className="check-row">
                <input type="checkbox" name="winter" defaultChecked={r.winterEquipment} /> {tr("Equipamento de inverno incluído")}
              </label>
              <SecretInput has={initial?.hasSecret && !removeCode} onRemove={() => setRemoveCode(true)} label="Número da reserva da locadora" />
            </section>
          )}
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
            {busy ? tr("Salvando…") : tr("Salvar veículo")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/** Stand-alone fuel calculator; the result can become a planned expense. */
function FuelCalculator({ trip, onSave, busy }: { trip: Trip; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const vehicles = (trip.vehicles || []).filter((v) => v.efficiency);
  const roadTrips = (trip.transports || []).filter((t) => t.road?.distanceKm);
  const [v, setV] = useState({ from: "", km: "", consumption: String(vehicles[0]?.efficiency ?? ""), unit: "km_per_l" as ConsumptionUnit, price: "", currency: trip.budget?.currency ?? "EUR", transportId: "" });
  const [msg, setMsg] = useState("");
  let result: ReturnType<typeof fuelEstimate> | undefined;
  let problem = "";
  try {
    if (v.km || v.price || v.consumption) result = fuelEstimate({ km: num(v.km) ?? 0, consumption: num(v.consumption) ?? 0, unit: v.unit, price: num(v.price) ?? -1, currency: v.currency });
  } catch (e) {
    problem = e instanceof Error ? e.message : "";
  }
  return (
    <section className="panel journey-card" aria-labelledby="fuel-title">
      <h3 id="fuel-title">
        <Calculator size={17} aria-hidden="true" /> {tr("Calculadora de combustível")}
      </h3>
      <div className="cost-grid">
        {roadTrips.length > 0 && (
          <label>
            {tr("Trecho")}
            <select
              value={v.transportId}
              onChange={(e) => {
                const t = roadTrips.find((x) => x.id === e.target.value);
                const car = (trip.vehicles || []).find((x) => t?.road?.vehicleIds?.includes(x.id) && x.efficiency);
                setV({ ...v, transportId: e.target.value, km: t ? String(t.road!.distanceKm) : v.km, consumption: car ? String(car.efficiency) : v.consumption });
              }}
            >
              <option value="">{tr("Digitar distância")}</option>
              {roadTrips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title || `${t.legs[0].from.name} → ${t.legs[t.legs.length - 1].to.name}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {tr("Distância (km)")}
          <input inputMode="decimal" value={v.km} onChange={(e) => setV({ ...v, km: e.target.value })} placeholder="500" />
        </label>
        <label>
          {tr("Consumo médio")}
          <span className="input-pair">
            <input inputMode="decimal" value={v.consumption} onChange={(e) => setV({ ...v, consumption: e.target.value })} placeholder="12,5" aria-label={tr("Consumo médio")} />
            <select value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value as ConsumptionUnit })} aria-label={tr("Unidade de consumo")}>
              <option value="km_per_l">km/L</option>
              <option value="l_per_100km">L/100 km</option>
              <option value="kwh_per_100km">kWh/100 km</option>
            </select>
          </span>
        </label>
        <label>
          {v.unit === "kwh_per_100km" ? tr("Preço por kWh") : tr("Preço por litro")}
          <span className="input-pair">
            <input inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} placeholder="1,70" aria-label={tr("Preço")} />
            <select value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })} aria-label={tr("Moeda")}>
              {currencies(trip, v.currency).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </span>
        </label>
      </div>
      {result ? (
        <div className="fuel-result" role="status">
          <span>
            <strong>{formatNumber(result.quantity, Number.isInteger(result.quantity) ? 0 : 1)}</strong> {result.unit}
          </span>
          <span>
            <strong>{formatMoney(result.cost, result.currency)}</strong> {tr("estimados")}
          </span>
          {v.transportId && (
            <button
              className="secondary small"
              disabled={busy}
              onClick={async () => {
                const t = roadTrips.find((x) => x.id === v.transportId)!;
                const next = setCost(trip, { transportId: t.id }, "fuel", { planned: result!.cost, currency: result!.currency, title: t.title || `${t.legs[0].from.name} → ${t.legs[t.legs.length - 1].to.name}`, date: t.legs[0].departDate || undefined, kind: t.kind });
                if (await onSave(next)) setMsg("Combustível previsto salvo no orçamento.");
              }}
            >
              {tr("Salvar como despesa prevista")}
            </button>
          )}
        </div>
      ) : (
        problem && v.km && <p className="muted">{tr(problem)}</p>
      )}
      <p className="muted">
        {tr("Litros = distância ÷ consumo. Custo = litros × preço. É uma estimativa: trânsito, relevo e carga mudam o consumo.")} {tr(msg)}
      </p>
    </section>
  );
}

const blankComparison = (trip: Trip): Comparison => ({
  currency: trip.budget?.currency ?? "BRL",
  passengers: trip.participants?.length || undefined,
  options: [newOption("Um carro grande", [{ label: "SUV 7 lugares", seats: 7 }]), newOption("Dois carros menores", [{ label: "Carro A", seats: 5 }, { label: "Carro B", seats: 5 }])],
});

/** One big car vs two smaller ones (or any mix); unknown values stay unknown. */
function CarComparator({ trip, onSave, busy }: { trip: Trip; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const [c, setC] = useState<Comparison>(() => trip.carComparison ?? blankComparison(trip));
  const [msg, setMsg] = useState("");
  const { results, cheapest } = compareOptions(c);
  const money = (minor: number) => formatMoney(toMajor(minor, c.currency), c.currency);
  const setCar = (oi: number, ci: number, patch: Partial<CarChoice>) =>
    setC({ ...c, options: c.options.map((o, i) => (i === oi ? { ...o, cars: o.cars.map((x, j) => (j === ci ? { ...x, ...patch } : x)) } : o)) });
  const field = (label: string, value: number | undefined, set: (n: number | undefined) => void, placeholder = "") => (
    <label>
      {tr(label)}
      <input inputMode="decimal" value={value ?? ""} onChange={(e) => set(num(e.target.value))} placeholder={placeholder || tr("Desconhecido")} />
    </label>
  );
  return (
    <section className="panel journey-card" aria-labelledby="compare-title">
      <h3 id="compare-title">
        <Scale size={17} aria-hidden="true" /> {tr("Comparar veículos")}
      </h3>
      <p className="muted">{tr("Dois carros pagam combustível, pedágio e estacionamento duas vezes e precisam de dois motoristas. Nem sempre saem mais baratos.")}</p>
      <div className="cost-grid">
        <label>
          {tr("Moeda")}
          <select value={c.currency} onChange={(e) => setC({ ...c, currency: e.target.value })}>
            {currencies(trip, c.currency).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        {field("Distância total (km)", c.km, (km) => setC({ ...c, km }))}
        {field("Preço do litro", c.fuelPrice, (fuelPrice) => setC({ ...c, fuelPrice }))}
        {field("Pedágios por carro", c.tolls, (tolls) => setC({ ...c, tolls }))}
        {field("Estacionamento por dia, por carro", c.parkingPerDay, (parkingPerDay) => setC({ ...c, parkingPerDay }))}
        {field("Dias de estacionamento", c.days, (days) => setC({ ...c, days }))}
        {field("Pessoas", c.passengers, (passengers) => setC({ ...c, passengers }))}
        {field("Malas", c.bags, (bags) => setC({ ...c, bags }))}
        {field("Motoristas autorizados", c.drivers, (drivers) => setC({ ...c, drivers }))}
      </div>
      <div className="compare-options">
        {c.options.map((o, oi) => {
          const r = results[oi];
          return (
            <article key={o.id} className={"compare-option" + (cheapest === o.id ? " is-best" : "")}>
              <header>
                <input className="compare-name" value={o.name} maxLength={60} onChange={(e) => setC({ ...c, options: c.options.map((x, i) => (i === oi ? { ...x, name: e.target.value } : x)) })} aria-label={tr("Nome da opção")} />
                {c.options.length > 1 && (
                  <button className="icon-button" onClick={() => setC({ ...c, options: c.options.filter((x) => x.id !== o.id) })} aria-label={tf("Remover {name}", { name: o.name })}>
                    <Trash2 size={15} />
                  </button>
                )}
              </header>
              {o.cars.map((car, ci) => (
                <div key={ci} className="compare-car">
                  <input value={car.label} maxLength={40} onChange={(e) => setCar(oi, ci, { label: e.target.value })} aria-label={tr("Carro")} />
                  {field("Aluguel", car.rental, (rental) => setCar(oi, ci, { rental }), "?")}
                  {field("km/L", car.efficiency, (efficiency) => setCar(oi, ci, { efficiency }), "?")}
                  {field("Lugares", car.seats, (seats) => setCar(oi, ci, { seats }), "?")}
                  {field("Malas", car.bags, (bags) => setCar(oi, ci, { bags }), "?")}
                  {o.cars.length > 1 && (
                    <button className="icon-button" onClick={() => setC({ ...c, options: c.options.map((x, i) => (i === oi ? { ...x, cars: x.cars.filter((_, j) => j !== ci) } : x)) })} aria-label={tr("Remover carro")}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button className="text-button small" onClick={() => setC({ ...c, options: c.options.map((x, i) => (i === oi ? { ...x, cars: [...x.cars, { label: tf("Carro {number}", { number: x.cars.length + 1 }) }] } : x)) })}>
                <Plus size={13} /> {tr("Adicionar carro")}
              </button>
              <dl className="compare-result">
                <div>
                  <dt>{tr("Aluguel")}</dt>
                  <dd>{money(r.parts.rental)}</dd>
                </div>
                <div>
                  <dt>{tr("Combustível")}</dt>
                  <dd>{money(r.parts.fuel)}</dd>
                </div>
                <div>
                  <dt>{tr("Pedágios")}</dt>
                  <dd>{money(r.parts.tolls)}</dd>
                </div>
                <div>
                  <dt>{tr("Estacionamento")}</dt>
                  <dd>{money(r.parts.parking)}</dd>
                </div>
                <div className="compare-total">
                  <dt>{tr("Total")}</dt>
                  <dd>{r.totalMinor !== undefined ? money(r.totalMinor) : tf("Incompleto: faltam {list}", { list: r.missing.map((m) => tr(m).toLowerCase()).join(", ") })}</dd>
                </div>
                {r.perPersonMinor !== undefined && (
                  <div>
                    <dt>{tr("Por pessoa")}</dt>
                    <dd>{money(r.perPersonMinor)}</dd>
                  </div>
                )}
              </dl>
              <ul className="compare-checks">
                {r.seatsOk !== undefined && <li className={r.seatsOk ? "ok" : "bad"}>{r.seatsOk ? tf("{seats} lugares: cabem todos", { seats: r.seats! }) : tf("{seats} lugares: não cabem todos", { seats: r.seats! })}</li>}
                {r.bagsOk !== undefined && <li className={r.bagsOk ? "ok" : "bad"}>{r.bagsOk ? tr("Malas cabem") : tr("Malas não cabem")}</li>}
                {r.driversOk !== undefined && <li className={r.driversOk ? "ok" : "bad"}>{r.driversOk ? tr("Motoristas suficientes") : tr("Faltam motoristas autorizados")}</li>}
              </ul>
              {cheapest === o.id && <p className="compare-badge">{tr("Menor custo entre as opções completas que atendem o grupo")}</p>}
            </article>
          );
        })}
      </div>
      <div className="profile-buttons">
        <button className="secondary small" onClick={() => setC({ ...c, options: [...c.options, newOption(tf("Opção {number}", { number: c.options.length + 1 }), [{ label: "Carro" }])] })}>
          <Plus size={14} /> {tr("Adicionar opção")}
        </button>
        <button
          className="primary small"
          disabled={busy}
          onClick={async () => {
            if (await onSave({ ...trip, carComparison: c })) setMsg("Comparação salva na viagem.");
          }}
        >
          {tr("Salvar comparação")}
        </button>
      </div>
      <p className="muted">
        {tr("Conforto e espaço também contam: confira o porta-malas real do modelo com a locadora.")} {tr(msg)}
      </p>
    </section>
  );
}

export function VehiclePanel({ trip, store, onSave, busy }: { trip: Trip; store: SecretStore; onSave: (t: Trip) => Promise<boolean>; busy: boolean }) {
  const [editing, setEditing] = useState<Vehicle | "new">();
  const vehicles = trip.vehicles || [];
  return (
    <>
      <section className="panel journey-card" aria-labelledby="vehicles-title">
        <div className="section-head">
          <h3 id="vehicles-title">
            <Car size={17} aria-hidden="true" /> {tr("Veículos")}
          </h3>
          <button className="secondary small" onClick={() => setEditing("new")}>
            <Plus size={14} /> {tr("Adicionar veículo")}
          </button>
        </div>
        {!vehicles.length && <p className="muted">{tr("Cadastre carros próprios ou alugados para estimar combustível e organizar a locação.")}</p>}
        <ul className="vehicle-list">
          {vehicles.map((v) => {
            const cost = linkedCost(trip, { vehicleId: v.id }, "rental");
            const r = v.rental;
            return (
              <li key={v.id} className="vehicle-item">
                <div>
                  <b>{tr(vehicleName(v))}</b>
                  <small>
                    {[v.ownership === "rental" ? tr("Alugado") : tr("Próprio"), v.category, v.fuel && tr(fuelKinds[v.fuel]), v.efficiency && `${formatNumber(v.efficiency, 1)} km/L`, v.seats && tf("{count} lugares", { count: v.seats })]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {r && (r.pickupDate || r.company) && (
                    <small>
                      {[r.company, r.pickupDate && tf("retirada {date} {time}", { date: r.pickupDate, time: r.pickupTime ?? "" }).trim(), r.dropoffDate && tf("devolução {date} {time}", { date: r.dropoffDate, time: r.dropoffTime ?? "" }).trim()]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  )}
                  {cost && (
                    <small>
                      {tr("Aluguel")}: {cost.estimate !== undefined ? formatMoney(cost.estimate, cost.currency) : "—"} {cost.amount > 0 && `· ${tr("pago")} ${formatMoney(cost.amount, cost.currency)}`}
                    </small>
                  )}
                  {v.hasSecret && <SecretView store={store} tripId={trip.id} refId={v.id} label="Reserva" />}
                </div>
                <div className="vehicle-actions">
                  <button className="icon-button" onClick={() => setEditing(v)} aria-label={tf("Editar {name}", { name: vehicleName(v) })}>
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={async () => {
                      if (!confirm(tr("Remover este veículo? As despesas dele continuam no orçamento."))) return;
                      if (await onSave(removeVehicle(trip, v.id))) await store.remove(trip.id, v.id).catch(() => undefined);
                    }}
                    aria-label={tf("Remover {name}", { name: vehicleName(v) })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <FuelCalculator trip={trip} onSave={onSave} busy={busy} />
      <CarComparator trip={trip} onSave={onSave} busy={busy} />
      {editing && <VehicleForm trip={trip} initial={editing === "new" ? undefined : editing} store={store} onSave={onSave} onClose={() => setEditing(undefined)} busy={busy} />}
    </>
  );
}
