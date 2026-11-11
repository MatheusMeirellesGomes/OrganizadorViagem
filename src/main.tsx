import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Compass,
  Download,
  ExternalLink,
  Globe2,
  Heart,
  ImagePlus,
  LayoutDashboard,
  Map,
  MapPin,
  Menu,
  Mountain,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  Wallet,
  X,
  Plane,
  BookOpen,
  LogIn,
  LogOut,
  Cloud,
  HardDrive,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  dateLabel,
  moveActivity,
  newTrip,
  pictures,
  coverLabels,
  statusLabels,
  uid,
  countByScope,
  matchesScope,
  tripScope,
  scopeLabels,
} from "./model";
import type { ScopeFilter, Trip, TripScope } from "./model";
const localModeKey = "gomes-modo-local";
const repository = supabase ? supabaseRepository(supabase) : null;
import { localKey, readLocal, saveLocal, supabase } from "./store";
import "./style.css";
import { downloadOffline, parseBackup } from "./offline";
import { ConflictError, friendlyError } from "./errors";
import {
  clearAccountCaches,
  persistWithVersion,
  readAccountCache,
  supabaseRepository,
  writeAccountCache,
  type RemoteRow,
} from "./remote";
import { TravelMap, type Coordinates } from "./TravelMap";
import { TravelMode } from "./TravelMode";
import { PhotoGallery } from "./PhotoGallery";
import { PrivatePhoto } from "./PrivatePhoto";
import { compressPhoto } from "./photos";
import { blobDataUrl } from "./backup";
import { RoutePlanner } from "./RoutePlanner";
import { SavedPlaces } from "./SavedPlaces";
import { Catalog } from "./Catalog";
import { portableTrips } from "./backup";
import { DocumentsPanel } from "./DocumentsPanel";
import { prepareTripAssets } from "./migration";
import { StaysPanel, ReservationLinks } from "./StaysPanel";
import { TripCalendar } from "./TripCalendar";
import { MigrationPanel } from "./MigrationPanel";
type Page = "home" | "trips" | "explore" | "map" | "history" | "profile";
type Modal = "trip" | "activity" | "reservation" | null;
const nav = [
  { id: "home", label: "Visão geral", icon: LayoutDashboard },
  { id: "trips", label: "Minhas viagens", icon: Compass },
  { id: "explore", label: "Explorar", icon: Search },
  { id: "map", label: "Meu mapa", icon: Globe2 },
  { id: "history", label: "Histórico", icon: BookOpen },
] as const;
const pageTitles = {
  home: "Seu próximo caminho começa aqui.",
  trips: "Todos os seus próximos capítulos.",
  explore: "Encontre o que faz a viagem valer.",
  map: "O mundo, do seu jeito.",
  history: "Cada viagem tem seu lugar.",
  profile: "Uma experiência com a sua cara.",
};
function App() {
  const [travelMode, setTravelMode] = useState(false);
  const [mapTrip, setMapTrip] = useState(""),
    [mapPoint, setMapPoint] = useState<Coordinates | undefined>();
  const [page, setPage] = useState<Page>("home"),
    [trips, setTrips] = useState<Trip[]>(readLocal),
    [localChoice, setLocalChoice] = useState(() => {
      try {
        return localStorage.getItem(localModeKey) === "1";
      } catch {
        return false;
      }
    }),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState("Roteiro"),
    [modal, setModal] = useState<Modal>(null),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all"),
    [day, setDay] = useState(1),
    [menu, setMenu] = useState(false),
    [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(!!supabase),
    // "live": loaded from the account; "cache": read-only copy on this device.
    [accountSource, setAccountSource] = useState<"live" | "cache">("live"),
    [loadError, setLoadError] = useState(""),
    [staleTrip, setStaleTrip] = useState(false),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [profile, setProfile] = useState(() => {
      try {
        return JSON.parse(
          localStorage.getItem("atlas-profile") ||
            '{"name":"","style":"No meu ritmo"}',
        );
      } catch {
        return { name: "", style: "No meu ritmo" };
      }
    });
  const versions = useRef<Record<string, string>>({});
  const importRef = useRef<HTMLInputElement>(null);
  const trip = trips.find((t) => t.id === selected);
  const firstName = profile.name.trim().split(" ")[0];
  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setNotice("Não foi possível verificar sua sessão."))
      .finally(() => setLoading(false));
    // Token refreshes also fire this event; only a sign-out swaps the data source.
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") {
        setSelected(null);
        setTravelMode(false);
        versions.current = {};
        setLoadError("");
        setStaleTrip(false);
        setTrips(readLocal());
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const applyRows = (rows: RemoteRow[]) => {
    versions.current = Object.fromEntries(
      rows.map((r) => [r.id, r.updated_at]),
    );
    setTrips(rows.map((r) => r.data));
  };
  const cacheTrips = (userId: string, list: Trip[]) =>
    writeAccountCache(
      userId,
      list
        .filter((t) => versions.current[t.id])
        .map((t) => ({
          id: t.id,
          data: t,
          updated_at: versions.current[t.id],
        })),
    );
  const loadAccount = useCallback(async (userId: string) => {
    if (!repository) return;
    setLoading(true);
    setLoadError("");
    try {
      const rows = await repository.list();
      applyRows(rows);
      setAccountSource("live");
      setStaleTrip(false);
      writeAccountCache(userId, rows);
    } catch (e) {
      const cache = readAccountCache(userId);
      if (cache) {
        applyRows(cache.rows);
        setAccountSource("cache");
        setNotice(
          "Sem conexão com a conta. Mostrando a cópia salva neste aparelho em " +
            new Date(cache.savedAt).toLocaleString("pt-BR") +
            ". Para editar, conecte-se à internet.",
        );
      } else
        setLoadError(
          friendlyError(e, "Não foi possível carregar suas viagens da conta."),
        );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (session) loadAccount(session.user.id);
  }, [session?.user.id, loadAccount]);
  useEffect(() => {
    // Back online after showing the offline copy: refresh from the account.
    if (online && session && accountSource === "cache")
      loadAccount(session.user.id);
  }, [online]);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!modal) return;
    const before = document.activeElement as HTMLElement;
    const el = document.querySelector<HTMLDialogElement>("dialog");
    el?.showModal();
    el?.querySelector<HTMLInputElement>("input")?.focus();
    return () => before?.focus();
  }, [modal]);
  const go = (p: Page) => {
    setTravelMode(false);
    setPage(p);
    setSelected(null);
    setMenu(false);
    setSearch("");
    setFilter("all");
    setScopeFilter("all");
  };
  async function save(t: Trip) {
    setBusy(true);
    try {
      const next = trips.some((x) => x.id === t.id)
        ? trips.map((x) => (x.id === t.id ? t : x))
        : [t, ...trips];
      if (session && repository) {
        if (accountSource === "cache" || !online)
          throw new Error(
            "Sem conexão: esta alteração não foi salva. Conecte-se à internet para editar as viagens da sua conta.",
          );
        const row = await persistWithVersion(
          repository,
          t,
          session.user.id,
          versions.current,
        );
        versions.current[row.id] = row.updated_at;
        const saved = next.map((x) => (x.id === row.id ? row.data : x));
        setTrips(saved);
        cacheTrips(session.user.id, saved);
        return true;
      }
      saveLocal(next);
      setTrips(next);
      return true;
    } catch (e) {
      if (e instanceof ConflictError) setStaleTrip(true);
      setNotice(
        e instanceof Error && e.message.startsWith("Sem conexão:")
          ? e.message
          : friendlyError(e, "Não foi possível salvar. Tente novamente."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function remove(t: Trip) {
    if (!confirm(`Excluir “${t.title}”? Esta ação não pode ser desfeita.`))
      return;
    try {
      const next = trips.filter((x) => x.id !== t.id);
      if (session && repository) {
        if (accountSource === "cache" || !online) throw new Error("offline");
        await repository.remove(t.id, versions.current[t.id]);
        delete versions.current[t.id];
        cacheTrips(session.user.id, next);
      } else saveLocal(next);
      setTrips(next);
      setSelected(null);
      setNotice("Viagem excluída.");
    } catch (e) {
      if (e instanceof ConflictError) setStaleTrip(true);
      setNotice(
        friendlyError(
          e instanceof Error && e.message === "offline"
            ? { message: "Failed to fetch" }
            : e,
          "Não foi possível excluir a viagem.",
        ),
      );
    }
  }
  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("O limite de importação é 20 MB.");
      const imported = parseBackup(await file.text());
      if (session && repository) {
        if (accountSource === "cache" || !online)
          throw { message: "Failed to fetch" };
        const saved: Trip[] = [];
        let failed = 0;
        for (const t of imported) {
          try {
            const prepared = await prepareTripAssets(
              repository,
              session.user.id,
              t,
            );
            const row = await repository.insert(prepared, session.user.id);
            versions.current[row.id] = row.updated_at;
            saved.push(row.data);
          } catch {
            failed++;
          }
        }
        const next = [...saved, ...trips];
        setTrips(next);
        cacheTrips(session.user.id, next);
        setNotice(
          failed
            ? `${saved.length} viagens importadas para a conta. ${failed} não puderam ser salvas; tente importar o arquivo novamente.`
            : `${saved.length} viagens importadas para a conta como novas cópias.`,
        );
        return;
      }
      const next = [...imported, ...trips];
      saveLocal(next);
      setTrips(next);
      setNotice(`${imported.length} viagens importadas como novas cópias.`);
    } catch (e) {
      setNotice(
        e instanceof SyntaxError
          ? "O arquivo não é um JSON válido."
          : e instanceof Error && !("code" in e)
            ? e.message
            : friendlyError(e, "Falha na importação."),
      );
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  }
  async function exportData() {
    if (busy) return;
    setBusy(true);
    try {
      const portable = await portableTrips(trips, async (bucket, path) => {
        if (!supabase || !session)
          throw new Error(
            "Entre na conta de origem para incluir os anexos no backup.",
          );
        const { data, error } = await supabase.storage
          .from(bucket)
          .download(path);
        if (error || !data)
          throw new Error(
            "Um anexo não pôde ser baixado. Confira a conexão e tente novamente. Nenhum backup incompleto foi gerado.",
          );
        return data;
      });
      const blob = new Blob(
        [JSON.stringify({ version: 1, trips: portable }, null, 2)],
        { type: "application/json" },
      );
      if (blob.size > 20 * 1024 * 1024)
        throw new Error(
          "O backup excede o limite atual de 20 MB. Baixe seus anexos separadamente antes de reduzir o conteúdo.",
        );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "gomes-pelo-mundo-viagens.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Backup criado com os anexos. Guarde o arquivo em local privado.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível exportar.",
      );
    } finally {
      setBusy(false);
    }
  }
  const pageTrips = trips.filter((t) =>
    page === "history" ? t.status === "past" : t.status !== "past",
  );
  const scopeCounts = countByScope(pageTrips);
  const visible = pageTrips.filter(
    (t) =>
      matchesScope(t, scopeFilter) &&
      (filter === "all" || t.status === filter) &&
      (t.title + " " + t.destination)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const openTrip = (t: Trip) => {
    setTravelMode(false);
    setSelected(t.id);
    setTab("Roteiro");
    setDay(1);
  };
  const field = (form: FormData, name: string) =>
    String(form.get(name) || "").trim();
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let result = false;
    if (modal === "trip") {
      const start = field(f, "start"),
        end = field(f, "end");
      if (start && end && end < start) {
        setNotice("A data final precisa ser igual ou posterior à inicial.");
        return;
      }
      const t = newTrip({
        title: field(f, "title") || field(f, "destination") || "Nova viagem",
        destination: field(f, "destination"),
        start,
        end,
        status: field(f, "status") as Trip["status"],
        scope: field(f, "scope") as Trip["scope"],
        cover: field(f, "cover") || "coast",
      });
      result = await save(t);
      if (result) openTrip(t);
    }
    if (modal === "activity" && trip) {
      result = await save({
        ...trip,
        activities: [
          ...trip.activities,
          {
            id: uid(),
            title: field(f, "title") || "Nova atividade",
            day: Number(field(f, "day")) || day,
            time: field(f, "time"),
            address: field(f, "address"),
            kind: field(f, "kind"),
            period: field(f, "period") as import("./calendar").Period,
            done: false,
          },
        ],
      });
    }
    if (modal === "reservation" && trip) {
      const url = field(f, "url");
      if (url && !/^https?:\/\//i.test(url)) {
        setNotice("Use um link começando com https:// ou http://.");
        return;
      }
      result = await save({
        ...trip,
        reservations: [
          ...(trip.reservations || []),
          {
            id: uid(),
            title: field(f, "title") || "Nova reserva",
            details: field(f, "details"),
            url,
          },
        ],
      });
    }
    if (result) setModal(null);
  }
  async function photos(files: FileList | null) {
    if (!trip || !files) return;
    setBusy(true);
    try {
      const additions = [];
      for (const file of Array.from(files)) {
        const compressed = await compressPhoto(file);
        const id = uid();
        let url = "";
        if (supabase && session) {
          const path = `${session.user.id}/${trip.id}/${id}`;
          const { error } = await supabase.storage
            .from("trip-photos")
            .upload(path, compressed, { contentType: compressed.type });
          if (error) throw error;
          url = path;
        } else {
          url = await blobDataUrl(compressed);
        }
        additions.push({ id, url, name: file.name });
      }
      if (
        await save({ ...trip, photos: [...(trip.photos || []), ...additions] })
      )
        setNotice("Fotos comprimidas e salvas. Guarde os originais com você.");
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Não foi possível adicionar as fotos.",
      );
    } finally {
      setBusy(false);
    }
  }
  function card(t: Trip) {
    return (
      <button className="trip-card" key={t.id} onClick={() => openTrip(t)}>
        <div
          className="trip-image"
          style={{
            backgroundImage: `url(${pictures[t.cover as keyof typeof pictures] || pictures.coast})`,
          }}
        >
          {t.photos.find((p) => p.id === t.coverPhotoId) && (
            <PrivatePhoto
              className="personal-cover"
              photo={t.photos.find((p) => p.id === t.coverPhotoId)!}
            />
          )}
          <span className="tag">{statusLabels[t.status]}</span>
          {tripScope(t) !== "undecided" && (
            <span className={"tag scope-tag scope-tag-" + tripScope(t)}>
              {tripScope(t) === "national" ? "BR " : ""}
              {scopeLabels[tripScope(t)]}
            </span>
          )}
          <span className="card-arrow">
            <ArrowRight size={19} />
          </span>
        </div>
        <div className="trip-info">
          <h3>{t.title}</h3>
          <p>
            <MapPin size={14} />
            {t.destination || "Destino em aberto"}
          </p>
          <footer>
            <CalendarDays size={14} />
            {dateLabel(t)}
            <span>{t.activities.length} lugares</span>
          </footer>
        </div>
      </button>
    );
  }
  return (
    <div className={trip && travelMode ? "app travel-mode-active" : "app"}>
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-mark">
            <Mountain size={25} />
          </span>
          <span className="brand-words">
            gomes<span>PELO MUNDO</span>
          </span>
        </a>
        <p className="nav-caption">SEU ESPAÇO</p>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id && !selected ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={20} />
              {n.label}
              {n.id === "trips" &&
                trips.filter((t) => t.status !== "past").length > 0 && (
                  <small>
                    {trips.filter((t) => t.status !== "past").length}
                  </small>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="note-icon">
            <Plane size={22} />
            <span>✦</span>
          </div>
          <h4>
            Menos abas abertas.
            <br />
            Mais mundo lá fora.
          </h4>
          <p>Um lugar para todos os seus caminhos.</p>
        </div>
        <button
          className={"profile-link " + (page === "profile" ? "active" : "")}
          onClick={() => go("profile")}
        >
          <span className="avatar">
            {firstName ? firstName[0].toUpperCase() : <User size={18} />}
          </span>
          <span>
            <b>{firstName || "Seu espaço pessoal"}</b>
            <small>
              {session ? "Conta conectada" : "Explorador de possibilidades"}
            </small>
          </span>
          <Settings2 size={16} />
        </button>
      </aside>
      {menu && (
        <button
          className="menu-shade"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Abrir menu"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Meu espaço <ChevronRight size={13} />
            <b>
              {trip
                ? trip.title
                : nav.find((n) => n.id === page)?.label || "Perfil"}
            </b>
          </div>
          <div className="top-actions">
            <span className="storage-badge">
              {session ? <Cloud size={14} /> : <HardDrive size={14} />}
              <span>
                {session && accountSource === "cache"
                  ? "Cópia offline da conta"
                  : !online
                    ? "Sem conexão"
                    : session
                      ? "Conta sincronizada"
                      : "Salvo neste navegador"}
              </span>
            </span>
            <button
              className="avatar"
              aria-label="Abrir perfil"
              onClick={() => go("profile")}
            >
              {firstName ? firstName[0].toUpperCase() : <User size={18} />}
            </button>
          </div>
        </header>
        <main>
          {staleTrip && session && !loading && (
            <div className="stale-banner" role="status">
              <Cloud size={18} />
              <p>
                Uma viagem foi alterada em outro aparelho. Nada foi sobrescrito.
                Recarregue para continuar a partir da versão mais recente.
              </p>
              <button
                className="secondary small"
                onClick={() => loadAccount(session.user.id)}
              >
                Recarregar viagens
              </button>
            </div>
          )}
          {session && repository && !loadError && accountSource === "live" && (
            <MigrationPanel
              key={session.user.id}
              userId={session.user.id}
              repo={repository}
              online={online}
              onSent={() => loadAccount(session.user.id)}
            />
          )}
          {loading ? (
            <div className="empty">
              <Compass className="spin" />
              <h2>Preparando seus caminhos…</h2>
            </div>
          ) : session && loadError ? (
            <section className="panel account-error" role="alert">
              <Empty
                icon={Cloud}
                title="Não conseguimos abrir suas viagens"
                text={loadError}
                action="Tentar novamente"
                onAction={() => loadAccount(session.user.id)}
              />
            </section>
          ) : supabase && !session && !localChoice ? (
            <Auth
              onNotice={setNotice}
              onContinueLocal={() => {
                try {
                  localStorage.setItem(localModeKey, "1");
                } catch {
                  // Choice lasts only for this visit.
                }
                setLocalChoice(true);
              }}
            />
          ) : trip ? (
            travelMode ? (
              <TravelMode
                trip={trip}
                day={day}
                onDayChange={setDay}
                online={online}
                busy={busy}
                onSave={save}
                onBack={() => {
                  setTravelMode(false);
                  requestAnimationFrame(() =>
                    document.getElementById("travel-mode-entry")?.focus(),
                  );
                }}
              />
            ) : (
              <>
                <button className="back" onClick={() => setSelected(null)}>
                  <ArrowLeft size={16} />
                  Todas as viagens
                </button>
                <div
                  className="detail-hero"
                  style={{
                    backgroundImage: `linear-gradient(90deg,rgba(15,36,32,.8),rgba(15,36,32,.1)),url(${pictures[trip.cover as keyof typeof pictures] || pictures.coast})`,
                  }}
                >
                  {trip.photos.find((p) => p.id === trip.coverPhotoId) && (
                    <PrivatePhoto
                      className="personal-cover"
                      photo={trip.photos.find(
                        (p) => p.id === trip.coverPhotoId,
                      )!}
                    />
                  )}
                  <span className="eyebrow light">SEU PRÓXIMO CAPÍTULO</span>
                  <h1>{trip.title}</h1>
                  <p>
                    <MapPin size={16} />
                    {trip.destination || "Destino em aberto"}
                    <span>·</span>
                    <CalendarDays size={16} />
                    {dateLabel(trip)}
                  </p>
                </div>
                <div className="detail-toolbar">
                  <button
                    id="travel-mode-entry"
                    className="primary travel-mode-entry"
                    onClick={() => setTravelMode(true)}
                  >
                    <Compass size={18} />
                    Modo Viagem
                  </button>
                  <select
                    aria-label="Status da viagem"
                    value={trip.status}
                    disabled={busy}
                    onChange={(e) =>
                      save({
                        ...trip,
                        status: e.target.value as Trip["status"],
                      })
                    }
                  >
                    {Object.entries(statusLabels).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <button
                    className="text-button"
                    onClick={() => downloadOffline(trip)}
                  >
                    <Download size={16} />
                    Baixar roteiro offline
                  </button>
                </div>
                <div className="tabs detail-tabs">
                  {[
                    "Roteiro",
                    "Calendário",
                    "Lugares",
                    "Mapa",
                    "Informações",
                    "Hospedagens",
                    "Reservas",
                    "Documentos",
                    "Checklist",
                    "Fotos",
                    ...(trip.budgetEnabled ? ["Despesas"] : []),
                  ].map((v) => (
                    <button
                      key={v}
                      className={tab === v ? "selected" : ""}
                      onClick={() => setTab(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {tab === "Lugares" && (
                  <SavedPlaces trip={trip} onSave={save} busy={busy} />
                )}
                {tab === "Calendário" && (
                  <TripCalendar
                    trip={trip}
                    day={day}
                    onDayChange={setDay}
                    onOpenDay={() => setTab("Roteiro")}
                    onSave={save}
                    busy={busy}
                  />
                )}
                {tab === "Roteiro" && (
                  <div className="planner">
                    <section className="panel itinerary">
                      <div className="section-head">
                        <div>
                          <h2>Um dia de cada vez</h2>
                          <p>Monte seu roteiro no seu ritmo.</p>
                        </div>
                        <button
                          className="primary small"
                          onClick={() => setModal("activity")}
                        >
                          <Plus size={16} />
                          Atividade
                        </button>
                      </div>
                      <div className="days">
                        {Array.from(
                          {
                            length: Math.max(
                              3,
                              day,
                              ...trip.activities.map((a) => a.day),
                            ),
                          },
                          (_, i) => (
                            <button
                              key={i}
                              className={day === i + 1 ? "selected" : ""}
                              onClick={() => setDay(i + 1)}
                            >
                              Dia {i + 1}
                            </button>
                          ),
                        )}
                        <button
                          aria-label="Adicionar dia"
                          onClick={() =>
                            setDay(
                              Math.max(
                                3,
                                day,
                                ...trip.activities.map((a) => a.day),
                              ) + 1,
                            )
                          }
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          save({
                            ...trip,
                            activities: moveActivity(
                              trip.activities,
                              e.dataTransfer.getData("text/plain"),
                              day,
                            ),
                          });
                        }}
                      >
                        {trip.activities.filter((a) => a.day === day).length ===
                        0 ? (
                          <Empty
                            icon={MapPin}
                            title="O dia está aberto a possibilidades"
                            text="Adicione um passeio, uma pausa para café ou qualquer lugar que queira conhecer."
                            action="Adicionar atividade"
                            onAction={() => setModal("activity")}
                          />
                        ) : (
                          trip.activities
                            .filter((a) => a.day === day)
                            .map((a) => (
                              <article
                                className={"activity " + (a.done ? "done" : "")}
                                key={a.id}
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData("text/plain", a.id)
                                }
                              >
                                <button
                                  className="check"
                                  aria-label={
                                    a.done
                                      ? "Marcar como não visitado"
                                      : "Marcar como visitado"
                                  }
                                  onClick={() =>
                                    save({
                                      ...trip,
                                      activities: trip.activities.map((x) =>
                                        x.id === a.id
                                          ? { ...x, done: !x.done }
                                          : x,
                                      ),
                                    })
                                  }
                                >
                                  {a.done ? (
                                    <Check size={15} />
                                  ) : (
                                    <MapPin size={15} />
                                  )}
                                </button>
                                <div className="activity-content">
                                  <small>
                                    {a.time || "Sem horário"} · {a.kind}
                                  </small>
                                  <h3>{a.title}</h3>
                                  {a.address && (
                                    <a
                                      target="_blank"
                                      rel="noreferrer"
                                      href={
                                        "https://www.google.com/maps/search/?api=1&query=" +
                                        encodeURIComponent(a.address)
                                      }
                                    >
                                      {a.address}
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                  <div className="activity-controls">
                                    <select
                                      aria-label={
                                        "Mover " + a.title + " para dia"
                                      }
                                      value={a.day}
                                      onChange={(e) =>
                                        save({
                                          ...trip,
                                          activities: moveActivity(
                                            trip.activities,
                                            a.id,
                                            Number(e.target.value),
                                          ),
                                        })
                                      }
                                    >
                                      {Array.from(
                                        {
                                          length: Math.max(
                                            4,
                                            day + 1,
                                            ...trip.activities.map(
                                              (x) => x.day + 1,
                                            ),
                                          ),
                                        },
                                        (_, i) => (
                                          <option key={i} value={i + 1}>
                                            Dia {i + 1}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                    <button
                                      aria-label="Mover para cima"
                                      className="icon-button"
                                      onClick={() => {
                                        const items = [...trip.activities];
                                        const i = items.findIndex(
                                          (x) => x.id === a.id,
                                        );
                                        let prev = -1;
                                        for (let n = 0; n < i; n++) {
                                          if (items[n].day === a.day) prev = n;
                                        }
                                        if (prev >= 0) {
                                          [items[i], items[prev]] = [
                                            items[prev],
                                            items[i],
                                          ];
                                          save({ ...trip, activities: items });
                                        }
                                      }}
                                    >
                                      <ArrowUp size={14} />
                                    </button>
                                    <button
                                      aria-label="Mover para baixo"
                                      className="icon-button"
                                      onClick={() => {
                                        const items = [...trip.activities];
                                        const i = items.findIndex(
                                          (x) => x.id === a.id,
                                        );
                                        const offset = items
                                          .slice(i + 1)
                                          .findIndex((x) => x.day === a.day);
                                        if (offset >= 0) {
                                          const j = i + 1 + offset;
                                          [items[i], items[j]] = [
                                            items[j],
                                            items[i],
                                          ];
                                          save({ ...trip, activities: items });
                                        }
                                      }}
                                    >
                                      <ArrowDown size={14} />
                                    </button>
                                  </div>
                                </div>
                                <button
                                  className="icon-button"
                                  aria-label={"Excluir " + a.title}
                                  onClick={() =>
                                    save({
                                      ...trip,
                                      activities: trip.activities.filter(
                                        (x) => x.id !== a.id,
                                      ),
                                    })
                                  }
                                >
                                  <X size={16} />
                                </button>
                              </article>
                            ))
                        )}
                      </div>
                    </section>
                    <aside className="panel route-panel">
                      <div className="section-head">
                        <h2>Seu caminho</h2>
                        <Map size={18} />
                      </div>
                      <TravelMap trips={[trip]} />
                      <h3>
                        {trip.destination || "O destino é você quem escolhe"}
                      </h3>
                      <p>Consulte lugares e trajetos no Google Maps.</p>
                      <a
                        className="secondary"
                        target="_blank"
                        rel="noreferrer"
                        href={
                          "https://www.google.com/maps/search/?api=1&query=" +
                          encodeURIComponent(trip.destination || "mundo")
                        }
                      >
                        Abrir mapa <ExternalLink size={15} />
                      </a>
                      {trip.activities.filter((a) => a.day === day && a.address)
                        .length >= 2 && (
                        <a
                          className="text-button"
                          target="_blank"
                          rel="noreferrer"
                          href={routeUrl(trip, day)}
                        >
                          Ver trajeto do dia <ArrowRight size={15} />
                        </a>
                      )}
                      <div className="tip">
                        <Sparkles size={18} />
                        <p>
                          Deixe espaço para o inesperado. Nem todo momento
                          precisa de horário.
                        </p>
                      </div>
                    </aside>
                  </div>
                )}
                {tab === "Mapa" && (
                  <>
                    <RoutePlanner trip={trip} day={day} onDayChange={setDay} />
                    <section className="panel">
                      <div className="section-head">
                        <div>
                          <h2>O destino no mapa</h2>
                          <p>
                            Toque para marcar a localização principal desta
                            viagem.
                          </p>
                        </div>
                      </div>
                      <TravelMap
                        trips={[trip]}
                        selectable
                        onPick={(point) =>
                          save({ ...trip, coordinates: point })
                        }
                      />
                      <p className="subtle">
                        Os trajetos por ruas continuam disponíveis no Google
                        Maps, pelos endereços das atividades.
                      </p>
                    </section>
                  </>
                )}
                {tab === "Informações" && (
                  <form
                    key={trip.id}
                    className="panel settings-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const start = field(f, "start"),
                        end = field(f, "end");
                      if (start && end && end < start) {
                        setNotice("Confira a ordem das datas.");
                        return;
                      }
                      if (
                        await save({
                          ...trip,
                          title: field(f, "title") || "Nova viagem",
                          destination: field(f, "destination"),
                          start,
                          end,
                          scope: field(f, "scope") as Trip["scope"],
                          hotel: field(f, "hotel"),
                          notes: field(f, "notes"),
                          budgetEnabled: f.has("budget"),
                        })
                      )
                        setNotice("Informações atualizadas.");
                    }}
                  >
                    <h2>Do seu jeito, no seu tempo</h2>
                    <p>Todos os campos são opcionais.</p>
                    <label>
                      Nome da viagem
                      <input name="title" defaultValue={trip.title} />
                    </label>
                    <label>
                      Destino ou destinos
                      <input
                        name="destination"
                        defaultValue={trip.destination}
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Ida
                        <input
                          type="date"
                          name="start"
                          defaultValue={trip.start}
                        />
                      </label>
                      <label>
                        Volta
                        <input type="date" name="end" defaultValue={trip.end} />
                      </label>
                    </div>
                    <ScopePicker defaultValue={tripScope(trip)} />
                    <label>
                      Hospedagem e endereço
                      <input
                        name="hotel"
                        defaultValue={trip.hotel}
                        placeholder="Adicione quando decidir"
                      />
                    </label>
                    <label>
                      Anotações
                      <textarea
                        name="notes"
                        defaultValue={trip.notes}
                        rows={4}
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        name="budget"
                        type="checkbox"
                        defaultChecked={trip.budgetEnabled}
                      />
                      Quero usar o controle de despesas nesta viagem
                    </label>
                    <div className="section-head">
                      <button disabled={busy} className="primary">
                        Salvar alterações
                      </button>
                      <button
                        className="danger text-button"
                        type="button"
                        onClick={() => remove(trip)}
                      >
                        <Trash2 size={16} />
                        Excluir viagem
                      </button>
                    </div>
                  </form>
                )}
                {tab === "Hospedagens" && (
                  <StaysPanel trip={trip} onSave={save} busy={busy} />
                )}
                {tab === "Documentos" && (
                  <DocumentsPanel
                    trip={trip}
                    onSave={save}
                    busy={busy}
                    userId={session?.user.id}
                  />
                )}
                {tab === "Reservas" && (
                  <section className="panel">
                    <div className="section-head">
                      <div>
                        <h2>Tudo à mão</h2>
                        <p>Hotéis, voos, ingressos e links importantes.</p>
                      </div>
                      <button
                        className="primary small"
                        onClick={() => setModal("reservation")}
                      >
                        <Plus size={16} />
                        Reserva
                      </button>
                    </div>
                    {!(trip.reservations || []).length ? (
                      <Empty
                        icon={Plane}
                        title="Uma viagem sem papelada espalhada"
                        text="Guarde os detalhes e links das suas reservas aqui."
                      />
                    ) : (
                      trip.reservations.map((r) => (
                        <article className="list-row" key={r.id}>
                          <Plane size={22} />
                          <div>
                            <h3>{r.title}</h3>
                            <p className="pre-wrap">{r.details}</p>
                            <ReservationLinks
                              trip={trip}
                              reservationId={r.id}
                              onSave={save}
                              busy={busy}
                            />
                            {r.url && (
                              <a href={r.url} target="_blank" rel="noreferrer">
                                Abrir reserva <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                          <button
                            className="icon-button"
                            aria-label="Excluir reserva"
                            onClick={() =>
                              confirm("Excluir esta reserva?") &&
                              save({
                                ...trip,
                                reservations: trip.reservations.filter(
                                  (x) => x.id !== r.id,
                                ),
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </article>
                      ))
                    )}
                  </section>
                )}
                {tab === "Checklist" && (
                  <section className="panel settings-form">
                    <h2>Uma coisa de cada vez</h2>
                    <p>
                      {trip.checklist.filter((x) => x.done).length} de{" "}
                      {trip.checklist.length} tarefas concluídas
                    </p>
                    <form
                      className="inline-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const title = field(new FormData(form), "task");
                        if (
                          title &&
                          (await save({
                            ...trip,
                            checklist: [
                              ...trip.checklist,
                              { id: uid(), title, done: false },
                            ],
                          }))
                        )
                          form.reset();
                      }}
                    >
                      <input
                        name="task"
                        placeholder="O que você quer lembrar?"
                        aria-label="Nova tarefa"
                      />
                      <button className="primary" disabled={busy}>
                        <Plus size={17} />
                        Adicionar
                      </button>
                    </form>
                    {trip.checklist.map((c) => (
                      <div className="list-row" key={c.id}>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={c.done}
                            onChange={() =>
                              save({
                                ...trip,
                                checklist: trip.checklist.map((x) =>
                                  x.id === c.id ? { ...x, done: !x.done } : x,
                                ),
                              })
                            }
                          />
                          <span className={c.done ? "struck" : ""}>
                            {c.title}
                          </span>
                        </label>
                        <button
                          className="icon-button"
                          aria-label="Excluir tarefa"
                          onClick={() =>
                            save({
                              ...trip,
                              checklist: trip.checklist.filter(
                                (x) => x.id !== c.id,
                              ),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </section>
                )}
                {tab === "Fotos" && (
                  <PhotoGallery
                    trip={trip}
                    onSave={save}
                    onFiles={photos}
                    busy={busy}
                    cloud={!!session}
                  />
                )}
                {tab === "Despesas" && (
                  <section className="panel settings-form">
                    <h2>Despesas, se fizer sentido para você</h2>
                    <p>
                      Os totais são separados por moeda, sem conversão
                      automática.
                    </p>
                    <div className="expense-totals">
                      {["BRL", "EUR", "USD"].map((c) => (
                        <div key={c}>
                          <small>{c}</small>
                          <h2>
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: c,
                            }).format(
                              trip.expenses
                                .filter((x) => x.currency === c)
                                .reduce((s, x) => s + x.amount, 0),
                            )}
                          </h2>
                        </div>
                      ))}
                    </div>
                    <form
                      className="expense-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget,
                          f = new FormData(form);
                        const amount = Number(field(f, "amount"));
                        if (!Number.isFinite(amount) || amount <= 0) {
                          setNotice(
                            "Informe um valor maior que zero para registrar a despesa.",
                          );
                          return;
                        }
                        if (
                          await save({
                            ...trip,
                            expenses: [
                              ...trip.expenses,
                              {
                                id: uid(),
                                title: field(f, "title") || "Despesa",
                                amount,
                                currency: field(f, "currency"),
                              },
                            ],
                          })
                        )
                          form.reset();
                      }}
                    >
                      <input
                        name="title"
                        placeholder="Descrição"
                        aria-label="Descrição da despesa"
                      />
                      <input
                        name="amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="Valor"
                        aria-label="Valor"
                      />
                      <select name="currency" aria-label="Moeda">
                        <option>BRL</option>
                        <option>EUR</option>
                        <option>USD</option>
                      </select>
                      <button className="primary" disabled={busy}>
                        <Plus size={16} />
                      </button>
                    </form>
                    {trip.expenses.map((x) => (
                      <div className="list-row" key={x.id}>
                        <Wallet size={20} />
                        <span>{x.title}</span>
                        <b>
                          {x.currency} {x.amount.toFixed(2)}
                        </b>
                        <button
                          className="icon-button"
                          aria-label="Excluir despesa"
                          onClick={() =>
                            save({
                              ...trip,
                              expenses: trip.expenses.filter(
                                (a) => a.id !== x.id,
                              ),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {page === "home"
                      ? `BEM-VINDO${firstName ? ", " + firstName.toUpperCase() : " À GOMES PELO MUNDO"}`
                      : "SEU MUNDO, SEM COMPLICAÇÃO"}
                  </p>
                  <h1>{pageTitles[page]}</h1>
                  <p>
                    {page === "home"
                      ? "Planos soltos, destinos dos sonhos e tudo o que vem pelo caminho."
                      : "Cada viagem começa com uma possibilidade. Organize do seu jeito."}
                  </p>
                </div>
                {page !== "profile" && (
                  <button className="primary" onClick={() => setModal("trip")}>
                    <Plus size={18} />
                    Nova viagem
                  </button>
                )}
              </div>
              {page === "home" && (
                <>
                  <section className="hero">
                    <div className="hero-shade" />
                    <div className="hero-content">
                      <span className="hero-pill">
                        <span /> O MUNDO ESTÁ LÁ FORA
                      </span>
                      <h2>
                        Qual vai ser o seu
                        <br />
                        <em>próximo destino?</em>
                      </h2>
                      <p>
                        Comece com uma ideia.
                        <br />O resto a gente organiza pelo caminho.
                      </p>
                      <button
                        className="cream-button"
                        onClick={() => setModal("trip")}
                      >
                        Planejar uma viagem <ArrowRight size={18} />
                      </button>
                    </div>
                    <div className="hero-location">
                      <MapPin size={15} />
                      <span>
                        Inspiração para ir além
                        <small>Um pouco de inspiração para começar</small>
                      </span>
                    </div>
                  </section>
                  <div className="stats">
                    <Stat
                      icon={Compass}
                      value={trips.filter((t) => t.status !== "past").length}
                      label="viagens por vir"
                    />
                    <Stat
                      icon={Globe2}
                      value={
                        new Set(
                          trips
                            .filter((t) => t.status === "past" && t.destination)
                            .map((t) => t.destination.toLowerCase()),
                        ).size
                      }
                      label="destinos visitados"
                    />
                    <Stat
                      icon={MapPin}
                      value={trips.reduce((n, t) => n + t.activities.length, 0)}
                      label="lugares no seu roteiro"
                    />
                    <Stat
                      icon={CheckCheck}
                      value={trips.filter((t) => t.status === "past").length}
                      label="viagens realizadas"
                    />
                  </div>
                  <div className="section-head">
                    <div>
                      <h2>Seus próximos caminhos</h2>
                      <p>Uma viagem de cada vez. Todas em um só lugar.</p>
                    </div>
                    <button className="text-button" onClick={() => go("trips")}>
                      Ver todas <ArrowRight size={16} />
                    </button>
                  </div>
                  {trips.some((t) => t.status !== "past") ? (
                    <div className="trip-grid">
                      {trips
                        .filter((t) => t.status !== "past")
                        .slice(0, 3)
                        .map(card)}
                    </div>
                  ) : (
                    <div className="onboarding-grid">
                      <button
                        className="create-card"
                        onClick={() => setModal("trip")}
                      >
                        <span className="dashed-icon">
                          <Plus size={25} />
                        </span>
                        <h3>Sua primeira viagem começa aqui</h3>
                        <p>
                          Um destino, uma ideia ou só a vontade de ir.
                          <br />
                          Você não precisa ter tudo decidido.
                        </p>
                        <span className="green-link">
                          Criar minha primeira viagem <ArrowRight size={16} />
                        </span>
                      </button>
                      <div className="editorial-card">
                        <div>
                          <span className="eyebrow">
                            FEITO PARA O SEU RITMO
                          </span>
                          <h3>
                            O melhor plano
                            <br />
                            tem espaço para
                            <br />
                            <em>o inesperado.</em>
                          </h3>
                          <p>
                            Sem formulários intermináveis.
                            <br />
                            Sem orçamento obrigatório.
                            <br />
                            Só o que faz sentido para você.
                          </p>
                        </div>
                        <div className="editorial-compass">
                          <Compass size={105} strokeWidth={0.65} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="bottom-note">
                    <span>
                      <Heart size={15} />
                      Planejar também faz parte da viagem.
                    </span>
                    <span>Seu mundo. Seu ritmo. Gomes pelo Mundo.</span>
                  </div>
                </>
              )}
              {(page === "trips" || page === "history") && (
                <>
                  <div
                    className="scope-switch"
                    role="group"
                    aria-label="Tipo de viagem"
                  >
                    {(
                      [
                        ["all", "Todas", "Nacionais e internacionais"],
                        ["national", "Nacionais", "Pelo Brasil"],
                        ["international", "Internacionais", "Pelo mundo"],
                        ["undecided", "Sem tipo", "Ainda não definido"],
                      ] as const
                    )
                      .filter(
                        ([k]) =>
                          k !== "undecided" ||
                          scopeCounts.undecided > 0 ||
                          scopeFilter === "undecided",
                      )
                      .map(([k, label, hint]) => (
                        <button
                          key={k}
                          aria-pressed={scopeFilter === k}
                          className={scopeFilter === k ? "selected" : ""}
                          onClick={() => setScopeFilter(k)}
                        >
                          <span className={"scope-mark scope-" + k}>
                            {k === "national" ? (
                              "BR"
                            ) : k === "international" ? (
                              <Globe2 size={17} />
                            ) : k === "undecided" ? (
                              <Compass size={17} />
                            ) : (
                              <Plane size={17} />
                            )}
                          </span>
                          <span className="scope-text">
                            <b>{label}</b>
                            <small>{hint}</small>
                          </span>
                          <span className="scope-count">{scopeCounts[k]}</span>
                        </button>
                      ))}
                  </div>
                  <div className="filter-bar">
                    <div className="tabs">
                      {(page === "history"
                        ? [["all", "Todas as anteriores"]]
                        : [
                            ["all", "Todas"],
                            ["planning", "Em planejamento"],
                            ["upcoming", "Próximas"],
                            ["active", "Em andamento"],
                          ]
                      ).map(([k, v]) => (
                        <button
                          key={k}
                          onClick={() => setFilter(k)}
                          className={filter === k ? "selected" : ""}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Buscar viagem"
                        placeholder="Buscar viagem"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  {visible.length ? (
                    <div className="trip-grid">{visible.map(card)}</div>
                  ) : (
                    <section className="panel">
                      <Empty
                        icon={page === "history" ? BookOpen : Compass}
                        title={
                          search
                            ? "Nenhuma viagem encontrada"
                            : scopeFilter === "national"
                              ? "Nenhuma viagem nacional por aqui"
                              : scopeFilter === "international"
                                ? "Nenhuma viagem internacional por aqui"
                                : page === "history"
                                  ? "Seus caminhos anteriores, organizados"
                                  : "Espaço para o seu próximo destino"
                        }
                        text={
                          search
                            ? "Tente outro nome ou destino."
                            : scopeFilter === "national" ||
                                scopeFilter === "international"
                              ? "Cadastre uma nova ou defina o tipo de uma viagem existente na aba Informações."
                              : page === "history"
                                ? "Quando quiser, cadastre uma viagem antiga ou marque uma viagem como concluída."
                                : "Comece sem datas, sem hotel e sem orçamento. Complete quando quiser."
                        }
                        action={
                          search
                            ? undefined
                            : page === "history"
                              ? "Cadastrar viagem anterior"
                              : "Criar viagem"
                        }
                        onAction={() => setModal("trip")}
                      />
                    </section>
                  )}
                </>
              )}
              {page === "explore" && (
                <Catalog trips={trips} onSave={save} saving={busy} />
              )}
              {page === "map" && (
                <section className="panel world-panel">
                  <div className="section-head">
                    <div>
                      <h2>Todos os seus caminhos no mapa</h2>
                      <p>
                        Marque os destinos das suas viagens. Os pontos ficam
                        salvos com cada viagem.
                      </p>
                    </div>
                    <Globe2 size={26} />
                  </div>
                  <TravelMap
                    trips={trips}
                    selectable={!!mapTrip}
                    onPick={mapTrip ? setMapPoint : undefined}
                    focus={mapPoint}
                  />
                  <div className="map-editor">
                    <label>
                      Marcar uma viagem
                      <select
                        value={mapTrip}
                        onChange={(e) => {
                          setMapTrip(e.target.value);
                          setMapPoint(
                            trips.find((t) => t.id === e.target.value)
                              ?.coordinates,
                          );
                        }}
                      >
                        <option value="">Selecione uma viagem</option>
                        {trips.map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {mapTrip
                        ? "Clique no mapa para escolher o destino e depois salve o ponto."
                        : "Selecione uma viagem para posicionar o destino no mapa."}
                    </p>
                    <button
                      className="primary"
                      disabled={!mapPoint || !mapTrip || busy}
                      onClick={async () => {
                        const chosen = trips.find((t) => t.id === mapTrip);
                        if (
                          chosen &&
                          mapPoint &&
                          (await save({ ...chosen, coordinates: mapPoint }))
                        ) {
                          setNotice("Destino marcado no mapa.");
                          setMapPoint(undefined);
                          setMapTrip("");
                        }
                      }}
                    >
                      <MapPin size={16} />
                      Salvar ponto
                    </button>
                  </div>
                  <div className="destination-list">
                    {trips
                      .filter((t) => t.destination || t.coordinates)
                      .map((t) => (
                        <button key={t.id} onClick={() => openTrip(t)}>
                          <MapPin size={19} />
                          <span>
                            <b>{t.destination || t.title}</b>
                            <small>{statusLabels[t.status]}</small>
                          </span>
                          <ArrowRight size={16} />
                        </button>
                      ))}
                  </div>
                  {!trips.length && (
                    <button
                      className="secondary"
                      onClick={() => setModal("trip")}
                    >
                      <Plus size={17} />
                      Criar uma viagem
                    </button>
                  )}
                  <p className="subtle">
                    Mapa online · Você escolhe os pontos manualmente. A busca
                    automática de endereços será conectada depois.
                  </p>
                </section>
              )}
              {page === "profile" && (
                <div className="profile-grid">
                  <form
                    className="panel settings-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const next = {
                        name: field(f, "name"),
                        style: field(f, "style"),
                      };
                      localStorage.setItem(
                        "atlas-profile",
                        JSON.stringify(next),
                      );
                      setProfile(next);
                      setNotice("Preferências salvas neste aparelho.");
                    }}
                  >
                    <div className="profile-avatar">
                      <User size={30} />
                    </div>
                    <h2>Seu perfil de explorador</h2>
                    <p>Uma apresentação, se quiser. Nada obrigatório.</p>
                    <label>
                      Como podemos chamar você?
                      <input
                        name="name"
                        defaultValue={profile.name}
                        placeholder="Seu nome"
                      />
                    </label>
                    <label>
                      Seu ritmo de viagem
                      <select name="style" defaultValue={profile.style}>
                        <option>No meu ritmo</option>
                        <option>Quero explorar bastante</option>
                        <option>Prefiro dias tranquilos</option>
                        <option>Um pouco de cada</option>
                      </select>
                    </label>
                    <button className="primary">Salvar preferências</button>
                  </form>
                  <section className="panel">
                    <h2>Seus dados, com você</h2>
                    <p>
                      {session
                        ? "Suas viagens são salvas na sua conta Supabase."
                        : "Você está no modo local. As viagens ficam neste navegador e não são sincronizadas com outros aparelhos."}
                    </p>
                    <button className="secondary" onClick={exportData}>
                      <Download size={17} />
                      Exportar backup das viagens
                    </button>
                    <p className="subtle">
                      O arquivo JSON inclui informações e fotos locais. Fotos da
                      nuvem permanecem na conta.
                    </p>
                    <input
                      ref={importRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(e) => restoreBackup(e.target.files?.[0])}
                    />
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => importRef.current?.click()}
                    >
                      <Plus size={17} />
                      Importar backup
                    </button>
                    <p className="subtle">
                      As viagens são adicionadas como novas cópias. Nenhuma
                      viagem existente é substituída.
                    </p>
                    {session ? (
                      <button
                        className="text-button"
                        onClick={async () => {
                          clearAccountCaches();
                          const { error } = await supabase!.auth.signOut();
                          if (error)
                            setNotice(
                              friendlyError(
                                error,
                                "Não foi possível sair da conta.",
                              ),
                            );
                        }}
                      >
                        <LogOut size={16} />
                        Sair da conta
                      </button>
                    ) : supabase ? (
                      <div className="tip">
                        <Cloud size={20} />
                        <div>
                          <p>
                            Crie uma conta ou entre para acessar suas viagens em
                            outros aparelhos. Você poderá enviar as viagens
                            deste navegador para a conta.
                          </p>
                          <button
                            className="secondary"
                            onClick={() => {
                              try {
                                localStorage.removeItem(localModeKey);
                              } catch {
                                // Nothing stored.
                              }
                              setLocalChoice(false);
                            }}
                          >
                            <LogIn size={17} />
                            Entrar ou criar conta
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="tip">
                        <Cloud size={20} />
                        <p>
                          Para entrar na conta e sincronizar aparelhos,
                          configure o projeto Supabase seguindo o README do
                          repositório.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </main>
        <nav className="mobile-nav">
          {nav
            .filter((n) => n.id !== "history")
            .map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => go(n.id)}
              >
                <n.icon size={21} />
                <span>{n.label}</span>
              </button>
            ))}
          <button
            onClick={() => go("profile")}
            className={page === "profile" ? "active" : ""}
          >
            <User size={21} />
            <span>Perfil</span>
          </button>
        </nav>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="Fechar mensagem"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <dialog
          onCancel={() => setModal(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <form onSubmit={handleSubmit}>
            <div className="section-head">
              <span className="modal-icon">
                {modal === "trip" ? (
                  <Compass />
                ) : modal === "activity" ? (
                  <MapPin />
                ) : (
                  <Plane />
                )}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Fechar"
                onClick={() => setModal(null)}
              >
                <X />
              </button>
            </div>
            <h2>
              {modal === "trip"
                ? "Todo caminho começa com uma ideia."
                : modal === "activity"
                  ? "O que vamos fazer?"
                  : "Uma reserva, tudo organizado."}
            </h2>
            <p>
              {modal === "trip"
                ? "Preencha só o que já sabe. O resto pode esperar."
                : "Adicione os detalhes que forem úteis para você."}
            </p>
            <label>
              {modal === "trip" ? "Nome da viagem" : "Nome"}
              <input
                name="title"
                placeholder={
                  modal === "trip"
                    ? "Uma nova aventura"
                    : modal === "activity"
                      ? "Um café, um museu, uma caminhada…"
                      : "Hotel, voo, ingresso…"
                }
              />
            </label>
            {modal === "trip" ? (
              <>
                <label>
                  Destino
                  <input
                    name="destination"
                    placeholder="Para onde a vontade leva?"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Ida <small>opcional</small>
                    <input type="date" name="start" />
                  </label>
                  <label>
                    Volta <small>opcional</small>
                    <input type="date" name="end" />
                  </label>
                </div>
                <ScopePicker
                  defaultValue={
                    scopeFilter === "all" ? "undecided" : scopeFilter
                  }
                />
                <label>
                  Momento da viagem
                  <select
                    name="status"
                    defaultValue={page === "history" ? "past" : "planning"}
                  >
                    {Object.entries(statusLabels).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="cover-picker">
                  <legend>Uma capa para começar</legend>
                  {Object.entries(pictures).map(([k, v], i) => (
                    <label key={k} style={{ backgroundImage: `url(${v})` }}>
                      <input
                        type="radio"
                        name="cover"
                        value={k}
                        defaultChecked={i === 0}
                      />
                      <span>{coverLabels[k as keyof typeof pictures]}</span>
                    </label>
                  ))}
                </fieldset>
              </>
            ) : modal === "activity" ? (
              <>
                <div className="form-grid">
                  <label>
                    Dia
                    <input
                      type="number"
                      name="day"
                      min="1"
                      max="365"
                      defaultValue={day}
                    />
                  </label>
                  <label>
                    Horário
                    <input name="time" type="time" />
                  </label>
                </div>
                <label>
                  Período opcional
                  <select name="period">
                    <option value="any">Sem período</option>
                    <option value="morning">Manhã</option>
                    <option value="afternoon">Tarde</option>
                    <option value="evening">Noite</option>
                  </select>
                </label>
                <label>
                  Categoria
                  <select name="kind">
                    <option>Passeio</option>
                    <option>Restaurante</option>
                    <option>Transporte</option>
                    <option>Tempo livre</option>
                    <option>Outro</option>
                  </select>
                </label>
                <label>
                  Endereço ou lugar
                  <input name="address" placeholder="Para abrir no mapa" />
                </label>
              </>
            ) : (
              <>
                <label>
                  Detalhes
                  <textarea
                    name="details"
                    rows={3}
                    placeholder="Código de reserva, horários, endereço…"
                  />
                </label>
                <label>
                  Link
                  <input name="url" type="url" placeholder="https://" />
                </label>
              </>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "Salvando…"
                : modal === "trip"
                  ? "Criar viagem"
                  : "Adicionar"}
              <ArrowRight size={17} />
            </button>
            <span className="form-footnote">
              {modal === "trip"
                ? "Sem orçamento obrigatório. Sem pressa."
                : "Você pode reorganizar depois."}
            </span>
          </form>
        </dialog>
      )}
    </div>
  );
}
function ScopePicker({ defaultValue }: { defaultValue: TripScope }) {
  const options = [
    ["national", "Nacional", "Pelo Brasil", "BR"],
    ["international", "Internacional", "Fora do Brasil", ""],
    ["undecided", "Ainda não sei", "Defina depois", ""],
  ] as const;
  return (
    <fieldset className="scope-picker">
      <legend>
        Tipo de viagem <small>opcional</small>
      </legend>
      {options.map(([value, label, hint, mark]) => (
        <label key={value}>
          <input
            type="radio"
            name="scope"
            value={value}
            defaultChecked={defaultValue === value}
          />
          <span className={"scope-mark scope-" + value} aria-hidden="true">
            {mark ||
              (value === "international" ? (
                <Globe2 size={16} />
              ) : (
                <Compass size={16} />
              ))}
          </span>
          <span className="scope-text">
            <b>{label}</b>
            <small>{hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Compass;
  value: number;
  label: string;
}) {
  return (
    <div className="stat">
      <span>
        <Icon size={21} />
      </span>
      <div>
        <strong>{String(value).padStart(2, "0")}</strong>
        <p>{label}</p>
      </div>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: typeof Compass;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={29} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={onAction}>
          <Plus size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
function routeUrl(t: Trip, day: number) {
  const stops = t.activities
    .filter((a) => a.day === day && a.address)
    .map((a) => a.address);
  return (
    "https://www.google.com/maps/dir/?api=1&origin=" +
    encodeURIComponent(stops[0]) +
    "&destination=" +
    encodeURIComponent(stops[stops.length - 1]) +
    "&waypoints=" +
    encodeURIComponent(stops.slice(1, -1).join("|"))
  );
}
function Auth({
  onNotice,
  onContinueLocal,
}: {
  onNotice: (s: string) => void;
  onContinueLocal: () => void;
}) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="panel auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        try {
          const credentials = {
            email: String(f.get("email")),
            password: String(f.get("password")),
          };
          const { data, error } = signup
            ? await supabase!.auth.signUp({
                ...credentials,
                options: { emailRedirectTo: window.location.origin },
              })
            : await supabase!.auth.signInWithPassword(credentials);
          if (error) throw error;
          if (signup && !data.session)
            onNotice(
              "Conta criada. Confira seu e-mail e abra o link de confirmação para entrar.",
            );
        } catch (e) {
          onNotice(
            friendlyError(
              e,
              signup
                ? "Não foi possível criar a conta. Tente novamente."
                : "Não foi possível entrar. Tente novamente.",
            ),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="modal-icon">
        <Compass />
      </span>
      <h1>Seu mundo começa aqui.</h1>
      <p>
        {signup
          ? "Crie sua conta para organizar seus caminhos."
          : "Entre para acessar suas viagens em qualquer aparelho."}
      </p>
      <label>
        E-mail
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Senha
        <input
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete={signup ? "new-password" : "current-password"}
        />
      </label>
      <button className="primary full" disabled={busy}>
        {busy ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}
      </button>
      <button
        className="text-button"
        type="button"
        onClick={() => setSignup(!signup)}
      >
        {signup ? "Já tenho uma conta" : "Quero criar minha conta"}
      </button>
      <div className="auth-local">
        <button
          className="secondary full"
          type="button"
          onClick={onContinueLocal}
        >
          <HardDrive size={17} />
          Continuar sem conta
        </button>
        <p className="subtle">
          Suas viagens ficam salvas só neste navegador. Você pode criar a conta
          depois, pelo Perfil, e enviar essas viagens para ela.
        </p>
      </div>
    </form>
  );
}
if (
  "serviceWorker" in navigator &&
  (import.meta as unknown as { env: { PROD: boolean } }).env.PROD
) {
  navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
    console.warn("Cache offline indisponível neste navegador:", error);
  });
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
