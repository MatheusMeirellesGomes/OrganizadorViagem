import { t as tr, tf } from "./i18n";
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
  migratedElsewhere,
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
/** "Manter separadas": não pergunta de novo até a pessoa pedir em Meus dados. */
const separateKey = (userId: string) => "gomes-migracao-separada:" + userId;
/** Singular or plural sentence, translated, with {count} filled in. */
const counted = (
  n: number,
  one: string,
  many: string,
  values: Record<string, string | number> = {},
) => tf(n === 1 ? one : many, { count: n, ...values });
const tripName = (t: Trip) => t.title || tr("Viagem sem nome");

export function MigrationPanel({ userId, repo, online, onSent }: Props) {
  const [local, setLocal] = useState<Trip[]>(readLocal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(postponedKey(userId)) === "1" || localStorage.getItem(separateKey(userId)) === "1";
    } catch {
      return false;
    }
  });
  const elsewhere = migratedElsewhere(userId);
  const pending = pendingLocalTrips(local, readMigrated(userId)).filter((t) => !elsewhere.has(t.id));
  const otherAccount = local.filter((t) => elsewhere.has(t.id) && !readMigrated(userId)[t.id]).length;
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
          tr("Nenhuma viagem pôde ser confirmada na conta agora. Nada foi removido."),
        );
        return;
      }
      if (
        !confirm(
          counted(
            ids.length,
            "Remover {count} viagem deste navegador? Ela continua salva na sua conta.",
            "Remover {count} viagens deste navegador? Elas continuam salvas na sua conta.",
          ),
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

  function keepSeparate() {
    try {
      localStorage.setItem(separateKey(userId), "1");
    } catch {
      // Hidden only for this screen.
    }
    setHidden(true);
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
              ? counted(
                  report.sent,
                  "{count} viagem confirmada na sua conta",
                  "{count} viagens confirmadas na sua conta",
                )
              : tr("Nenhuma viagem foi enviada")}
          </h2>
          {report.failed.length > 0 && (
            <>
              <p>
                {counted(
                  report.failed.length,
                  "{count} viagem não pôde ser enviada e continua salva neste navegador:",
                  "{count} viagens não puderam ser enviadas e continuam salvas neste navegador:",
                )}
              </p>
              <ul>
                {report.failed.map((f) => (
                  <li key={f.trip.id}>
                    <b>{tripName(f.trip)}</b>: {tr(f.message)}
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
                {counted(
                  report.conflicts.length,
                  "{count} viagem já existe na conta com outro conteúdo. Nada foi substituído: {names}.",
                  "{count} viagens já existem na conta com outro conteúdo. Nada foi substituído: {names}.",
                  { names: report.conflicts.map(tripName).join(", ") },
                )}
              </p>
              <div className="migration-actions">
                <button
                  className="primary small"
                  disabled={busy || !online}
                  onClick={() => send(report.conflicts, true)}
                >{tr("Enviar como cópias")}</button>
                <button
                  className="secondary small"
                  disabled={busy}
                  onClick={() => keepAccountVersion(report.conflicts)}
                >{tr("Manter só a versão da conta")}</button>
              </div>
            </>
          )}
          {confirmedLocal.length > 0 && !report.conflicts.length && (
            <>
              <p>{tr("Uma cópia continua neste navegador. Você pode mantê-la ou removê-la; a conta não é afetada.")}</p>
              <div className="migration-actions">
                <button
                  className="secondary small"
                  disabled={busy || !online}
                  onClick={removeLocalCopy}
                >
                  <HardDrive size={15} />{tr("Remover cópia deste navegador")}</button>
                <button className="text-button" onClick={() => setReport(null)}>{tr("Manter cópia local")}</button>
              </div>
            </>
          )}
          {done && !confirmedLocal.length && (
            <button className="text-button" onClick={() => setReport(null)}>
              {tr("Fechar")}
            </button>
          )}
          {error && <p className="migration-error">{tr(error)}</p>}
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
          {counted(
            pending.length,
            "{count} viagem salva só neste navegador",
            "{count} viagens salvas só neste navegador",
          )}
        </h2>
        <p>{tr("Você criou estas viagens antes de entrar. O que prefere fazer com elas?")}</p>
        <ul className="migration-names">
          {pending.slice(0, 4).map((t) => (
            <li key={t.id}>{tripName(t)}</li>
          ))}
          {pending.length > 4 && <li>{tf("e mais {count}", { count: pending.length - 4 })}</li>}
        </ul>
        <div className="migration-actions">
          <button
            className="primary small"
            disabled={busy || !online}
            onClick={() => send(pending)}
          >
            {busy ? tr("Enviando…") : tr("Importar para minha conta")}
          </button>
          <button className="secondary small" disabled={busy} onClick={keepSeparate}>{tr("Manter separadas")}</button>
          <button className="text-button" disabled={busy} onClick={postpone}>{tr("Agora não")}</button>
        </div>
        <p className="migration-hint">
          {tr("Importar: as viagens vão para a conta e uma cópia continua aqui. Nada da conta é substituído; viagens repetidas são detectadas. Manter separadas: ficam só neste navegador e você continua usando as da conta. Dá para mudar depois em Meu espaço → Meus dados.")}
        </p>
        {otherAccount > 0 && (
          <p className="migration-hint">
            {counted(otherAccount, "{count} viagem deste navegador já foi enviada para outra conta e não é oferecida aqui.", "{count} viagens deste navegador já foram enviadas para outra conta e não são oferecidas aqui.")}
          </p>
        )}
        {!online && (
          <p className="migration-error">{tr("Conecte-se à internet para enviar.")}</p>
        )}
        {error && <p className="migration-error">{tr(error)}</p>}
      </div>
    </section>
  );
}
