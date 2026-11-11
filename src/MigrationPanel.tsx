import { t as tr } from "./i18n";
import { useState } from "react";
import {
  CheckCircle2,
  CloudUpload,
  HardDrive,
  TriangleAlert,
} from "lucide-react";
import type { Trip } from "./model";
import type { TripRepository } from "./remote";
import { friendlyError } from "./errors";
import { readLocal, saveLocal } from "./store";
import {
  pendingLocalTrips,
  planMigration,
  readMigrated,
  rememberMigrated,
  removableLocalIds,
  runMigration,
} from "./migration";

type Props = {
  userId: string;
  repo: TripRepository;
  online: boolean;
  /** Reloads the account's trips after something was sent. */
  onSent: () => Promise<void> | void;
};

type Report = {
  sent: number;
  conflicts: Trip[];
  failed: { trip: Trip; message: string }[];
};

const postponedKey = (userId: string) => "gomes-migracao-adiada:" + userId;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
const tripName = (t: Trip) => t.title || "Viagem sem nome";

export function MigrationPanel({ userId, repo, online, onSent }: Props) {
  const [local, setLocal] = useState<Trip[]>(readLocal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(postponedKey(userId)) === "1";
    } catch {
      return false;
    }
  });
  const pending = pendingLocalTrips(local, readMigrated(userId));
  const confirmedLocal = local.filter((t) => readMigrated(userId)[t.id]);

  if (hidden || (!report && pending.length === 0)) return null;

  async function send(trips: Trip[], asCopies = false) {
    setBusy(true);
    setError("");
    try {
      const remote = await repo.list();
      const plan = asCopies
        ? { toSend: trips, alreadyInAccount: [], conflicts: [] }
        : planMigration(trips, remote, readMigrated(userId));
      // Identical trips already in the account count as migrated.
      rememberMigrated(
        userId,
        Object.fromEntries(plan.alreadyInAccount.map((t) => [t.id, t.id])),
      );
      const result = await runMigration(repo, userId, plan.toSend, {
        asCopies,
      });
      setReport({
        sent:
          Object.keys(result.confirmed).length + plan.alreadyInAccount.length,
        conflicts: [...plan.conflicts.map((c) => c.local), ...result.conflicts],
        failed: result.failed,
      });
      await onSent();
    } catch (e) {
      setError(
        friendlyError(
          e,
          "Não foi possível enviar as viagens. Nada foi alterado.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function keepAccountVersion(trips: Trip[]) {
    // The account copy stays as it is; the local version is left untouched.
    rememberMigrated(
      userId,
      Object.fromEntries(trips.map((t) => [t.id, t.id])),
    );
    setReport((r) => (r ? { ...r, conflicts: [] } : r));
  }

  async function removeLocalCopy() {
    setBusy(true);
    setError("");
    try {
      // Fresh read: only trips confirmed in the account right now are removed.
      const ids = removableLocalIds(
        local,
        readMigrated(userId),
        await repo.list(),
      );
      if (!ids.length) {
        setError(
          "Nenhuma viagem pôde ser confirmada na conta agora. Nada foi removido.",
        );
        return;
      }
      if (
        !confirm(
          `Remover ${plural(ids.length, "viagem", "viagens")} deste navegador? ` +
            "Elas continuam salvas na sua conta.",
        )
      )
        return;
      const remaining = readLocal().filter((t) => !ids.includes(t.id));
      saveLocal(remaining);
      setLocal(remaining);
      setReport(null);
    } catch (e) {
      setError(
        friendlyError(
          e,
          "Não foi possível confirmar as viagens na conta. Nada foi removido.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function postpone() {
    try {
      sessionStorage.setItem(postponedKey(userId), "1");
    } catch {
      // Hidden only for this screen.
    }
    setHidden(true);
  }

  if (report) {
    const done = !report.failed.length && !report.conflicts.length;
    return (
      <section className="migration-panel" aria-live="polite">
        <span className={"migration-icon" + (done ? " ok" : " warn")}>
          {done ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}
        </span>
        <div className="migration-body">
          <h2>
            {report.sent
              ? `${plural(report.sent, "viagem confirmada", "viagens confirmadas")} na sua conta`
              : "Nenhuma viagem foi enviada"}
          </h2>
          {report.failed.length > 0 && (
            <>
              <p>
                {plural(
                  report.failed.length,
                  "viagem não pôde",
                  "viagens não puderam",
                )}{" "}
                ser
                {report.failed.length === 1 ? " enviada" : " enviadas"} e{" "}
                {report.failed.length === 1
                  ? "continua salva"
                  : "continuam salvas"}{" "}
                neste navegador:
              </p>
              <ul>
                {report.failed.map((f) => (
                  <li key={f.trip.id}>
                    <b>{tripName(f.trip)}</b>: {f.message}
                  </li>
                ))}
              </ul>
              <div className="migration-actions">
                <button
                  className="secondary small"
                  disabled={busy || !online}
                  onClick={() => send(report.failed.map((f) => f.trip))}
                >
                  {tr("Tentar novamente")}
                </button>
              </div>
            </>
          )}
          {report.conflicts.length > 0 && (
            <>
              <p>
                {plural(
                  report.conflicts.length,
                  "viagem já existe",
                  "viagens já existem",
                )}{" "}
                na conta com outro conteúdo. Nada foi substituído:{" "}
                {report.conflicts.map(tripName).join(", ")}.
              </p>
              <div className="migration-actions">
                <button
                  className="primary small"
                  disabled={busy || !online}
                  onClick={() => send(report.conflicts, true)}
                >
                  Enviar como cópias
                </button>
                <button
                  className="secondary small"
                  disabled={busy}
                  onClick={() => keepAccountVersion(report.conflicts)}
                >
                  Manter só a versão da conta
                </button>
              </div>
            </>
          )}
          {confirmedLocal.length > 0 && !report.conflicts.length && (
            <>
              <p>
                Uma cópia continua neste navegador. Você pode mantê-la ou
                removê-la; a conta não é afetada.
              </p>
              <div className="migration-actions">
                <button
                  className="secondary small"
                  disabled={busy || !online}
                  onClick={removeLocalCopy}
                >
                  <HardDrive size={15} />
                  Remover cópia deste navegador
                </button>
                <button className="text-button" onClick={() => setReport(null)}>
                  Manter cópia local
                </button>
              </div>
            </>
          )}
          {done && !confirmedLocal.length && (
            <button className="text-button" onClick={() => setReport(null)}>
              {tr("Fechar")}
            </button>
          )}
          {error && <p className="migration-error">{error}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="migration-panel" aria-live="polite">
      <span className="migration-icon">
        <CloudUpload size={20} />
      </span>
      <div className="migration-body">
        <h2>
          {plural(pending.length, "viagem salva", "viagens salvas")} só neste
          navegador
        </h2>
        <p>
          Envie para sua conta para acessar em outros aparelhos. Nada que já
          está na conta será substituído, e a cópia deste navegador só sai se
          você pedir.
        </p>
        <div className="migration-actions">
          <button
            className="primary small"
            disabled={busy || !online}
            onClick={() => send(pending)}
          >
            {busy ? "Enviando…" : "Enviar para minha conta"}
          </button>
          <button className="text-button" disabled={busy} onClick={postpone}>
            Agora não
          </button>
        </div>
        {!online && (
          <p className="migration-error">Conecte-se à internet para enviar.</p>
        )}
        {error && <p className="migration-error">{error}</p>}
      </div>
    </section>
  );
}
